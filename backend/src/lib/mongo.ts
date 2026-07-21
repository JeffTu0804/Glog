import mongoose from "mongoose";

const globalForMongo = globalThis as unknown as {
  mongoReady?: Promise<typeof mongoose>;
};

function resolveMongoUri(): string {
  const uri =
    process.env.MONGO_URI ||
    process.env.MongoDB_connection_string_url ||
    process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "缺少 MONGO_URI 環境變數（業務資料已改以 MongoDB Atlas 為準）",
    );
  }
  return uri.trim();
}

/** 連線 MongoDB Atlas（冪等；dev 熱重載共用同一 Promise） */
export async function connectMongo(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  if (!globalForMongo.mongoReady) {
    const uri = resolveMongoUri();
    globalForMongo.mongoReady = mongoose.connect(uri).then(() => {
      const dbName = mongoose.connection.name || "(default)";
      console.log(`[MongoDB] 已連線 → db=${dbName}`);
      return mongoose;
    });
  }
  return globalForMongo.mongoReady;
}

export async function disconnectMongo(): Promise<void> {
  globalForMongo.mongoReady = undefined;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export { mongoose };
