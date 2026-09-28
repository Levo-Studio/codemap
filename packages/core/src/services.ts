// SPDX-License-Identifier: Apache-2.0

// Packages that stand for a service outside the project, by the name the map
// shows for it. A package not listed here is a library, not a service, and
// does not become a node. `data` marks the ones that are where the project
// keeps or sends its data: a file that uses one belongs to Data & Services.

export interface Service {
  name: string;
  data: boolean;
}

const service = (name: string, data = false): Service => ({ name, data });

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

  "@prisma/client": service("Prisma", true),
  prisma: service("Prisma", true),
  "drizzle-orm": service("Drizzle", true),
  pg: service("Postgres", true),
  postgres: service("Postgres", true),
  "@neondatabase/serverless": service("Neon Postgres", true),
  "@vercel/postgres": service("Postgres", true),
  mysql2: service("MySQL", true),
  "better-sqlite3": service("SQLite", true),
  mongodb: service("MongoDB", true),
  mongoose: service("MongoDB", true),
  redis: service("Redis", true),
  ioredis: service("Redis", true),
  "@upstash/redis": service("Upstash Redis", true),
  sqlalchemy: service("SQLAlchemy", true),
  psycopg: service("Postgres", true),
  psycopg2: service("Postgres", true),
  "gorm.io/gorm": service("GORM", true),
  "github.com/jackc/pgx": service("Postgres", true),

  "@aws-sdk/client-s3": service("S3", true),
  "@vercel/blob": service("Vercel Blob", true),
  boto3: service("AWS", true),

  "next-auth": service("Auth.js"),
  "@auth/core": service("Auth.js"),
  "@clerk/nextjs": service("Clerk"),
  "@clerk/clerk-sdk-node": service("Clerk"),
  "@auth0/nextjs-auth0": service("Auth0"),
  "better-auth": service("Better Auth"),

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
