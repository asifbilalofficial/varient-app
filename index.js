import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// ✅ Allow all origins and methods for frontend requests
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com"; // your shop domain
const ACCESS_TOKEN = "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"; // Admin API token

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint to create a variant
app.post("/create-variant", async (req, res) => {
  const { product_id, option_name, price, weight } = req.body;

  if (!product_id || !option_name || !price || !weight) {
    return res.status(400).json({
      error: "product_id, option_name, price, and weight are required",
    });
  }

  try {
    // Unique option name to avoid conflicts
    const uniqueOption = `${option_name}-${Date.now()}`;

    // 🔹 1️⃣ Create variant (older API style: 2023-07)
    const variantResponse = await fetch(
      `https://${SHOP}/admin/api/2023-07/products/${product_id}/variants.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          variant: {
            option1: uniqueOption,
            price: String(price),
            sku: `SKU-${Date.now()}`,
            inventory_management: "shopify",
            weight: weight,
            weight_unit: "g",
          },
        }),
      }
    );

    const variantData = await variantResponse.json();

    if (!variantResponse.ok) {
      console.error("Shopify variant error:", variantData);
      return res.status(variantResponse.status).json({ error: variantData });
    }

    const variant = variantData.variant;

    // 🔹 2️⃣ Get store location_id
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/2023-07/locations.json`,
      {
        headers: {
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
      }
    );

    const locationData = await locationRes.json();
    if (!locationRes.ok) {
      console.error("Shopify location error:", locationData);
      return res.status(locationRes.status).json({ error: locationData });
    }

    const locationId = locationData.locations[0].id;

    // 🔹 3️⃣ Set inventory
    const stockRes = await fetch(
      `https://${SHOP}/admin/api/2023-07/inventory_levels/set.json`,
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
      console.error("Shopify stock error:", stockData);
      return res.status(stockRes.status).json({ error: stockData });
    }

    // ✅ Success response
    res.status(201).json({ variant, stock: stockData });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
