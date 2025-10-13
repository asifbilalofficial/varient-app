import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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";

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint to create a variant and set stock = 10
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight, package_dimensions } = req.body;

  if (!product_id || !option_name || !price) {
    return res.status(400).json({ error: "product_id, option_name, and price are required" });
  }

  try {
    // 1️⃣ Create unique option name
    const uniqueOptionName = `${option_name}-${Date.now()}`;

    // 2️⃣ Create variant
    const response = await fetch(
      `https://${SHOP}/admin/api/2025-01/products/${product_id}/variants.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          variant: {
            option1: uniqueOptionName,
            price: String(price),
            sku: `SKU-${Date.now()}`,
            inventory_management: "shopify",
            weight: weight || 0,
            weight_unit: "g"
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });

    const variant = data.variant;

    // 3️⃣ Store package dimensions as metafields
    if (package_dimensions) {
      const metafields = [
        {
          key: "package_width",
          value: String(package_dimensions.width || 0),
          type: "single_line_text_field",
          namespace: "custom_shipping"
        },
        {
          key: "package_height",
          value: String(package_dimensions.height || 0),
          type: "single_line_text_field",
          namespace: "custom_shipping"
        },
        {
          key: "package_length",
          value: String(package_dimensions.length || 0),
          type: "single_line_text_field",
          namespace: "custom_shipping"
        },
      ];

      for (const mf of metafields) {
        await fetch(
          `https://${SHOP}/admin/api/2025-01/variants/${variant.id}/metafields.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": ACCESS_TOKEN,
            },
            body: JSON.stringify({ metafield: mf }),
          }
        );
      }
    }

    // 4️⃣ Get store location_id
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/locations.json`,
      { headers: { "X-Shopify-Access-Token": ACCESS_TOKEN } }
    );
    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id;

    // 5️⃣ Set inventory to 10
    const stockRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/inventory_levels/set.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          location_id: locationId,
          inventory_item_id: variant.inventory_item_id,
          available: 10,
        }),
      }
    );

    const stockData = await stockRes.json();
    if (!stockRes.ok) return res.status(stockRes.status).json({ error: stockData });

    res.status(201).json({ variant, stock: stockData });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
