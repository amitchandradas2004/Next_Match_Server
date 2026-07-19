import { connectToDatabase } from "./index";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

async function runVerification() {
  // console.log("=== STARTING VERIFICATION ===");

  const db = await connectToDatabase();
  // console.log("Connected to database successfully.");

  // Test 1: Verify the chat_messages index is created
  // console.log("\n[Test 1] Checking chat_messages collection index...");
  const indexes = await db.collection("chat_messages").listIndexes().toArray();
  const hasHistoryIndex = indexes.some(idx => {
    const key = idx.key;
    return key.userId === 1 && key.conversationId === 1 && key.createdAt === 1;
  });

  if (hasHistoryIndex) {
    // console.log("SUCCESS: Index { userId: 1, conversationId: 1, createdAt: 1 } exists!");
  } else {
    console.warn("WARNING: Compound history index not found. Indexes:", JSON.stringify(indexes, null, 2));
  }

  // Test 2: Verify Listing keyword matching
  // console.log("\n[Test 2] Simulating listing keyword search extraction...");
  const distinctCitiesDocs = await db.collection("listings")
    .aggregate([{ $group: { _id: "$location.city" } }])
    .toArray();
  const distinctCities = distinctCitiesDocs
    .map(doc => doc._id)
    .filter((city): city is string => typeof city === "string" && city.trim() !== "");
  // console.log("Distinct cities in DB:", distinctCities);

  const testMessages = [
    "Find a house in Dhaka under 700 with 3 bedrooms",
    "Show me apartments in Chittagong above 500",
    "How does NextMatch work?"
  ];

  for (const message of testMessages) {
    // console.log(`\nQuery message: "${message}"`);
    const isAskingAboutListings = /price|rent|apartment|room|flat|house|bedroom|bathroom|show me|find|search|near/i.test(message);
    const cityInMessage = distinctCities.find(city =>
      new RegExp(`\\b${city}\\b`, "i").test(message)
    );

    // console.log(`- Mentions listings: ${isAskingAboutListings}`);
    // console.log(`- Detected city: ${cityInMessage || "None"}`);

    if (isAskingAboutListings || cityInMessage) {
      const listingQuery: any = { status: "active" };

      if (cityInMessage) {
        listingQuery["location.city"] = { $regex: `^${cityInMessage}$`, $options: "i" };
      }

      const priceMatch = message.match(/\b\d{3,5}\b/);
      if (priceMatch) {
        const price = parseInt(priceMatch[0], 10);
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes("under") || lowerMsg.includes("below") || lowerMsg.includes("max") || lowerMsg.includes("less than") || lowerMsg.includes("budget")) {
          listingQuery.price = { $lte: price };
        } else if (lowerMsg.includes("above") || lowerMsg.includes("over") || lowerMsg.includes("min") || lowerMsg.includes("more than")) {
          listingQuery.price = { $gte: price };
        } else {
          listingQuery.price = { $lte: price * 1.2 };
        }
      }

      const bedroomMatch = message.match(/(\d+)\s*(?:bedroom|bhk|bed)/i);
      if (bedroomMatch) {
        listingQuery.bedrooms = parseInt(bedroomMatch[1], 10);
      }

      // console.log("- Constructed Query:", JSON.stringify(listingQuery));
      const results = await db.collection("listings").find(listingQuery).limit(3).toArray();
      // console.log(`- Found ${results.length} matching listings in DB.`);
      if (results.length > 0) {
        // console.log("  Sample Match:", results[0].title, "-", results[0].location.city, "- Price:", results[0].price);
      }
    } else {
      // console.log("- General inquiry, no DB listing queries needed.");
    }
  }

  // Test 3: Authenticated Request check
  // console.log("\n[Test 3] Testing authentication lookup logic...");
  const sampleSession = await db.collection("session").findOne({});
  if (sampleSession) {
    // console.log("Found a sample session token:", sampleSession.token);
    const sessionDoc = await db.collection("session").findOne({ token: sampleSession.token });
    if (sessionDoc) {
      const userDoc = await db.collection("user").findOne({ _id: sessionDoc.userId });
      if (userDoc) {
        // console.log(`SUCCESS: Found user associated with session: ${userDoc.name} (${userDoc.email})`);
      } else {
        // console.warn("WARNING: Session exists but associated user not found.");
      }
    }
  } else {
    // console.log("No sessions found in the database. Please log in on the client first.");
  }

  // console.log("\n=== VERIFICATION COMPLETED ===");
  process.exit(0);
}

runVerification().catch(err => {
  // console.error("Verification failed:", err);
  process.exit(1);
});
