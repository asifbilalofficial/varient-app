import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com"; // your shop domain
const ACCESS_TOKEN = "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"; // Admin API token

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint to create a variant, set stock = 10, and add shipping package
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight, width, height, length, quantity } = req.body;

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
            weight: weight,
            weight_unit: "g", // ✅ required by Shopify
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const variant = data.variant;

    // 3️⃣ Get store location_id (needed for inventory)
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/locations.json`,
      {
        headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
      }
    );

    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id; // pick first location

    // 4️⃣ Set inventory to 10
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

    if (!stockRes.ok) {
      return res.status(stockRes.status).json({ error: stockData });
    }

    // 5️⃣ Packaging Logic (NEW)
    if (width && height && length && quantity) {
      const packedWidth = parseFloat(width) + 2;
      const packedHeight = parseFloat(height) + 2;
      const packedLength = parseFloat(length) + 4;
      const boxesNeeded = Math.ceil(quantity / 4);

      const packageName = `Box for ${uniqueOptionName} (${boxesNeeded} box${boxesNeeded > 1 ? "es" : ""})`;

      // 6️⃣ Create Shipping Package in Shopify
      const packageRes = await fetch(
        `https://${SHOP}/admin/api/2025-01/shipping_packages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": ACCESS_TOKEN,
          },
          body: JSON.stringify({
            shipping_package: {
              name: packageName,
              length: packedLength,
              width: packedWidth,
              height: packedHeight,
              weight: weight,
              dimension_unit: "in",
              weight_unit: "g",
            },
          }),
        }
      );

      const packageData = await packageRes.json();

      if (!packageRes.ok) {
        console.error("Error creating package:", packageData);
      } else {
        console.log("✅ Shipping package created:", packageData.shipping_package);
      }
    }

    // ✅ Return both variant + stock confirmation
    res.status(201).json({ variant, stock: stockData });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
