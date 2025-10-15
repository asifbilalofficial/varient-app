import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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"; // ⚠️ Replace safely

// Utility: GraphQL call
async function shopifyGraphQL(query) {
  const res = await fetch(`https://${SHOP}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.errors) console.error("GraphQL Errors:", data.errors);
  return data;
}

// Simple weight formula (customize this)
function calculateWeight(variant) {
  const baseWeight = 100; // grams
  const area = (variant.length || 10) * (variant.width || 10);
  const thickness = variant.height || 1;
  return Math.round(baseWeight + area * thickness * 0.2);
}

// Create package in Shopify
async function createPackageForVariant(variant, weight) {
  const name = `Package - ${variant.title || variant.id}`;
  const length = 10;
  const width = 10;
  const height = 5;
  const unit = "CENTIMETERS";
  const weightUnit = "GRAMS";

  const mutation = `
    mutation {
      packageCreate(input: {
        name: "${name}"
        dimensionUnit: ${unit}
        weightUnit: ${weightUnit}
        length: ${length}
        width: ${width}
        height: ${height}
        weight: ${weight}
      }) {
        package {
          id
          name
          length
          width
          height
          weight
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation);
  const pkg = result.data?.packageCreate?.package;
  if (pkg) console.log(`✅ Created package ${pkg.name}`);
  else console.error("❌ Package creation failed:", result.data?.packageCreate?.userErrors);
  return pkg;
}

// Main endpoint
app.post("/update-variants", async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: "Missing productId" });

    // Fetch product & variants
    const resp = await fetch(
      `https://${SHOP}/admin/api/2024-10/products/${productId}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    const productData = await resp.json();
    const variants = productData.product?.variants || [];

    for (const variant of variants) {
      const weight = calculateWeight(variant);

      // Step 1: Update variant weight
      await fetch(
        `https://${SHOP}/admin/api/2024-10/variants/${variant.id}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            variant: {
              id: variant.id,
              weight,
              weight_unit: "g",
            },
          }),
        }
      );

      // Step 2: Create a custom package
      const pkg = await createPackageForVariant(variant, weight);

      // Step 3: Store package info in metafield (to track later)
      if (pkg) {
        await fetch(`https://${SHOP}/admin/api/2024-10/metafields.json`, {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metafield: {
              namespace: "variant_package",
              key: "package_info",
              value: JSON.stringify(pkg),
              type: "json",
              owner_resource: "variant",
              owner_id: variant.id,
            },
          }),
        });
      }
    }

    res.json({ success: true, message: "✅ Variants updated & packages created." });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (req, res) => res.send("🚀 Variant Package API is live"));

app.listen(3000, () => console.log("✅ Server running on port 3000"));
