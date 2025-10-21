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

// POST endpoint to create a variant, set stock = 10, and return direct checkout URL
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight, quantity } = req.body;

  if (!product_id || !option_name || !price) {
    return res.status(400).json({ error: "product_id, option_name, and price are required" });
  }

  quantity = quantity || 1; // default 1

  try {
    // 1️⃣ Create unique option name
    const uniqueOptionName = `${option_name}-${Date.now()}`;

    // 2️⃣ Create variant
    const variantRes = await fetch(
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
            weight_unit: "g",
          },
        }),
      }
    );

    const variantData = await variantRes.json();
    if (!variantRes.ok) return res.status(variantRes.status).json({ error: variantData });
    const variant = variantData.variant;

    // 3️⃣ Set inventory to 10
    const locationRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/locations.json`,
      {
        headers: { "X-Shopify-Access-Token": ACCESS_TOKEN },
      }
    );
    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id;

    await fetch(
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

    // 4️⃣ Create draft checkout with this variant
    const checkoutRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/checkouts.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          checkout: {
            line_items: [
              {
                variant_id: variant.id,
                quantity: quantity
              }
            ]
          }
        }),
      }
    );

    const checkoutData = await checkoutRes.json();
    if (!checkoutRes.ok) return res.status(checkoutRes.status).json({ error: checkoutData });

    // ✅ Return variant + checkout URL
    const checkoutUrl = checkoutData.checkout.web_url; // URL to go directly to checkout
    res.status(201).json({ variant, checkoutUrl });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
