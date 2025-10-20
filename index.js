import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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";

// Health check
app.get("/", (req, res) => res.send("Server is alive"));

// POST endpoint to create a variant and set stock = 10
app.post("/create-variant", async (req, res) => {
  let { product_id, option_name, price, weight } = req.body;

  if (!product_id || !option_name || !price) {
    return res.status(400).json({ error: "product_id, option_name, and price are required" });
  }

  try {
    // 1️⃣ Fetch all shipping profiles to get package ID
    const shippingRes = await fetch(`https://${SHOP}/admin/api/2025-01/shipping_profiles.json`, {
      headers: { "X-Shopify-Access-Token": ACCESS_TOKEN }
    });
    const shippingData = await shippingRes.json();

    // 2️⃣ Find package named "Custom Package 24 Inches"
    let packageId = null;
    for (const profile of shippingData.shipping_profiles) {
      if (profile.packages && profile.packages.length > 0) {
        const pkg = profile.packages.find(p => p.name === "Custom Package 24 Inches");
        if (pkg) {
          packageId = pkg.id;
          break;
        }
      }
    }

    if (!packageId) {
      return res.status(400).json({ error: "Package 'Custom Package 24 Inches' not found in Shopify" });
    }

    // 3️⃣ Create unique option name for variant
    const uniqueOptionName = `${option_name}-${Date.now()}`;

    // 4️⃣ Create variant
    const variantRes = await fetch(
      `https://${SHOP}/admin/api/2025-01/products/${product_id}/variants.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN
        },
        body: JSON.stringify({
          variant: {
            option1: uniqueOptionName,
            price: String(price),
            sku: `SKU-${Date.now()}`,
            inventory_management: "shopify",
            weight: weight,
            weight_unit: "g",
            package_id: packageId // ✅ Assign custom package
          }
        })
      }
    );

    const variantData = await variantRes.json();
    if (!variantRes.ok) return res.status(variantRes.status).json({ error: variantData });

    const variant = variantData.variant;

    // 5️⃣ Get first store location
    const locationRes = await fetch(`https://${SHOP}/admin/api/2025-01/locations.json`, {
      headers: { "X-Shopify-Access-Token": ACCESS_TOKEN }
    });
    const locationData = await locationRes.json();
    const locationId = locationData.locations[0].id;

    // 6️⃣ Set inventory to 10
    const stockRes = await fetch(`https://${SHOP}/admin/api/2025-01/inventory_levels/set.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN
      },
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: variant.inventory_item_id,
        available: 10
      })
    });
    const stockData = await stockRes.json();
    if (!stockRes.ok) return res.status(stockRes.status).json({ error: stockData });

    // ✅ Return variant + stock info
    res.status(201).json({ variant, stock: stockData });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
