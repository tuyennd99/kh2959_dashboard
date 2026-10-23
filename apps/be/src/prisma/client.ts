import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaAdapter(
  connectionString = process.env.DATABASE_URL,
) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const url = new URL(connectionString);
  if (
    url.searchParams.get('sslmode') === 'require' &&
    !url.searchParams.has('uselibpqcompat')
  ) {
    url.searchParams.set('uselibpqcompat', 'true');
  }
  const schema = url.searchParams.get('schema') ?? undefined;
  url.searchParams.delete('schema');
  return new PrismaPg({ connectionString: url.toString() }, { schema });
}
