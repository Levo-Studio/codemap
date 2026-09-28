// SPDX-License-Identifier: Apache-2.0

// Packages that stand for a service outside the project, by the name the map
// shows for it. A package not listed here is a library, not a service, and
// does not become a node. `data` marks the ones that are where the project
// keeps or sends its data: a file that uses one belongs to Data & Services.

export interface Service {
  name: string;
  data: boolean;
  // A database or a sign-in service: changes around it come first in the
  // changes timeline.
  sensitive: boolean;
}

const service = (name: string, data = false, sensitive = false): Service => ({
  name,
  data,
  sensitive,
});
const database = (name: string) => service(name, true, true);
const auth = (name: string) => service(name, false, true);

const byPackage: Record<string, Service> = {
  stripe: service("Stripe"),
  "@stripe/stripe-js": service("Stripe"),
  "github.com/stripe/stripe-go": service("Stripe"),
  "@lemonsqueezy/lemonsqueezy.js": service("Lemon Squeezy"),
  "@paddle/paddle-node-sdk": service("Paddle"),

  resend: service("Resend", true),
  nodemailer: service("Email (SMTP)", true),
  "@sendgrid/mail": service("SendGrid", true),
  postmark: service("Postmark", true),

  "@prisma/client": database("Prisma"),
  prisma: database("Prisma"),
  "drizzle-orm": database("Drizzle"),
  pg: database("Postgres"),
  postgres: database("Postgres"),
  "@neondatabase/serverless": database("Neon Postgres"),
  "@vercel/postgres": database("Postgres"),
  mysql2: database("MySQL"),
  "better-sqlite3": database("SQLite"),
  mongodb: database("MongoDB"),
  mongoose: database("MongoDB"),
  redis: service("Redis", true),
  ioredis: service("Redis", true),
  "@upstash/redis": service("Upstash Redis", true),
  sqlalchemy: database("SQLAlchemy"),
  psycopg: database("Postgres"),
  psycopg2: database("Postgres"),
  "gorm.io/gorm": database("GORM"),
  "github.com/jackc/pgx": database("Postgres"),

  "@aws-sdk/client-s3": service("S3", true),
  "@vercel/blob": service("Vercel Blob", true),
  boto3: service("AWS", true),

  "next-auth": auth("Auth.js"),
  "@auth/core": auth("Auth.js"),
  "@clerk/nextjs": auth("Clerk"),
  "@clerk/clerk-sdk-node": auth("Clerk"),
  "@auth0/nextjs-auth0": auth("Auth0"),
  "better-auth": auth("Better Auth"),

  openai: service("OpenAI"),
  "@anthropic-ai/sdk": service("Anthropic"),
  anthropic: service("Anthropic"),

  "@sentry/nextjs": service("Sentry"),
  "@sentry/node": service("Sentry"),
  "posthog-js": service("PostHog"),
  "posthog-node": service("PostHog"),
  twilio: service("Twilio"),
  "@slack/web-api": service("Slack"),
  "@octokit/rest": service("GitHub"),
  octokit: service("GitHub"),
};

export function serviceOf(packageName: string): Service | undefined {
  return byPackage[packageName];
}
