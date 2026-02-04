import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "shpat_REPLACE_THIS_TOKEN"; // rotate token ASAP
const API_VERSION = "2024-10";

// Health check
app.get("/", (req, res) => {
  res.send("✅ Shopify Variant Server is running");
});

/**
 * Expected body:
 * {
 *   product_id: "123456789",
 *   option_value: "XL",
 *   price: "1999",
 *   weight: 500,
 *   stock: 10
 * }
 */
app.post("/create-variant", async (req, res) => {
  const { product_id, option_value, price, weight, stock = 10 } = req.body;

  if (!product_id || !option_value || !price || !weight) {
    return res.status(400).json({
      error: "product_id, option_value, price, and weight are required",
    });
  }

  try {
    /* -------------------- 1️⃣ CREATE VARIANT -------------------- */
    const variantRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/products/${product_id}/variants.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          variant: {
            option1: option_value, // MUST already exist on product (e.g. Size)
            price: String(price),
            sku: `SKU-${Date.now()}`,
            inventory_management: "shopify",
            weight: weight,
            weight_unit: "g",
          },
        }),
      }
    );

    const variantData = await variantRes.json();
    if (!variantRes.ok) {
      return res.status(variantRes.status).json({
        step: "variant_creation_failed",
        error: variantData,
      });
    }

    const variant = variantData.variant;

    /* -------------------- 2️⃣ GET LOCATION ID -------------------- */
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/${API_VERSION}/locations.json`,
      {
        headers: {
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
      }
    );

    const locationData = await locationRes.json();
    if (!locationRes.ok || !locationData.locations.length) {
      return res.status(500).json({
        step: "location_fetch_failed",
        error: locationData,
      });
    }

    const locationId = locationData.locations[0].id;

    /* -------------------- 3️⃣ SET INVENTORY -------------------- */
    const inventoryRes = await fetch(
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
          available: stock,
        }),
      }
    );

    const inventoryData = await inventoryRes.json();
    if (!inventoryRes.ok) {
      return res.status(inventoryRes.status).json({
        step: "inventory_set_failed",
        error: inventoryData,
      });
    }

    /* -------------------- ✅ SUCCESS -------------------- */
    res.status(201).json({
      message: "Variant created successfully",
      variant,
      inventory: inventoryData,
    });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
