import dns from 'node:dns';
import mongoose from 'mongoose';

// Some local/dev networks point Node's resolver at a stub DNS proxy (see
// dns.getServers()) that refuses the queries an Atlas SRV connection string
// needs (querySrv/queryA ECONNREFUSED) even though the OS's own resolver
// handles them fine. Falling back to public resolvers here fixes that
// without touching the OS network config — harmless if the default
// resolver already worked (Vercel/most hosts do).
dns.setServers(['8.8.8.8', '1.1.1.1']);

export async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}
