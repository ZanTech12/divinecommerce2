import "dotenv/config";
import mongoose from "mongoose";
import Order from "./models/Order.js";

async function fixOrderIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB.");

    const collection = Order.collection;

    const indexes = await collection.indexes();

    const oldIndex = indexes.find(
      index =>
        index.name === "monnifyPaymentReference_1"
    );

    if (oldIndex) {
      const isCorrect =
        oldIndex.unique === true &&
        oldIndex.partialFilterExpression?.monnifyPaymentReference?.$type === "string";

      if (!isCorrect) {
        console.log("Removing old Monnify index...");

        await collection.dropIndex(
          "monnifyPaymentReference_1"
        );
      }
    }

    console.log("Creating corrected Monnify index...");

    await collection.createIndex(
      { monnifyPaymentReference: 1 },
      {
        unique: true,
        partialFilterExpression: {
          monnifyPaymentReference: { $type: "string" }
        },
        name: "monnifyPaymentReference_1"
      }
    );

    console.log("Monnify index fixed successfully.");

    console.log(await collection.indexes());

  } catch (error) {
    console.error("Index correction failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

fixOrderIndexes();