// deno-lint-ignore-file no-console
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createCmsHandler } from "../../packages/handlers/mod.ts";
import { createLocalUploads } from "../../packages/storage/deno-fs.ts";
import * as schema from "./schema.ts";

// Database connection (persisted to ./data)
const client = new PGlite("./data");
const db = drizzle(client, { schema });

// File uploads (storage + static handler bundled together)
const uploads = createLocalUploads({
  directory: "./uploads",
  urlPrefix: "/uploads",
});

// Create CMS handler
const cmsHandler = createCmsHandler({
  db,
  schema,
  basePath: "/admin",
  storage: uploads.storage,
  fileFields: {
    // Configure posts.featuredImage as a file upload field
    "posts.featuredImage": {
      accept: "image/*",
      directory: "posts",
    },
  },
});

// Simple HTTP server
const PORT = 3000;

console.log(`🚀 CMS running at http://localhost:${PORT}/admin`);

Deno.serve({ port: PORT, hostname: "127.0.0.1" }, async (request: Request) => {
  const url = new URL(request.url);

  // Redirect root to admin
  if (url.pathname === "/") {
    return Response.redirect(new URL("/admin", request.url), 302);
  }

  // Serve uploaded files
  if (url.pathname.startsWith("/uploads")) {
    const staticResponse = await uploads.handler(request);
    if (staticResponse) return staticResponse;
  }

  // Handle admin routes
  if (url.pathname.startsWith("/admin")) {
    return await cmsHandler(request);
  }

  // 404 for everything else
  return new Response("Not Found", { status: 404 });
});
