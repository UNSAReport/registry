import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '@/config';

const sql = postgres(config.databaseUrl, { max: 1 });
const db = drizzle(sql);

console.log('Running registry database migrations...');
await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('Registry database migrations completed successfully.');
await sql.end();
