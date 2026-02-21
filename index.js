import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["POST", "GET"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// 🔑 Shopify credentials
const SHOP = "6bc1e6-f0.myshopify.com";
const ACCESS_TOKEN = "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"; // 🔥 add fresh token

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Server is alive");
});

// 🛒 Create Draft Order
app.post("/create-draft-order", async (req, res) => {
  const { variant_id, quantity, custom_price, custom_option, weight } =
    req.body;

  if (!variant_id || !quantity || !custom_price) {
    return res.status(400).json({
      error: "variant_id, quantity and custom_price are required",
    });
  }

  try {
    const response = await fetch(
      `https://${SHOP}/admin/api/2025-01/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
        body: JSON.stringify({
          draft_order: {
            line_items: [
              {
                variant_id: variant_id,
                quantity: quantity,
                price: String(custom_price),
                properties: [
                  {
                    name: "Selected Option",
                    value: custom_option || "Custom",
                  },
                  {
                    name: "Total Weight (g)",
                    value: weight || 0,
                  },
                ],
              },
            ],
            use_customer_default_address: true,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log("Shopify Error:", data);
      return res.status(response.status).json({ error: data });
    }

    res.status(201).json({
      checkout_url: data.draft_order.invoice_url,
    });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
