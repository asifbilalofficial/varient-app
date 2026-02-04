import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com"; // your shop domain
const ACCESS_TOKEN = "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"; // Admin API token
const API_VERSION = "2023-07"; // older API version

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint to create a single variant for multiple sizes
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight } = req.body;

  if (!product_id || !option_name || !price || !weight) {
    return res.status(400).json({
      error: "product_id, option_name, price, and weight are required",
    });
  }

  try {
    // 1️⃣ Create a unique variant option name
    const uniqueOptionName = `${option_name}-${Date.now()}`;

    // 2️⃣ Create variant using older API (2023-07)
    const response = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/products/${product_id}/variants.json`,
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
            weight_unit: "g",
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const variant = data.variant;

    // 3️⃣ Get store location_id
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/locations.json`,
      {
        headers: {
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
      }
    );

    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id;

    // 4️⃣ Set inventory
    const stockRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/inventory_levels/set.json`,
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

    // ✅ Return variant + stock confirmation
    res.status(201).json({ variant, stock: stockData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
