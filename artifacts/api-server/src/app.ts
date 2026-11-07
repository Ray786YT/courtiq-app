import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// The frontend is served from the same origin in production, so cross-origin
// credentials are only needed for local development against a Vite dev server.
app.use(
  cors({
    origin: process.env["CORS_ORIGIN"] ?? true,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

/**
 * Checked by name rather than `instanceof`. Under pnpm's isolated layout the
 * validation package and this one can resolve different physical copies of zod,
 * which makes `instanceof ZodError` quietly false and turns every bad request
 * body into a 500.
 */
function isValidationError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "ZodError"
  );
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (isValidationError(err)) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  // Log the detail, return none. Stack traces and database errors are not the
  // client's business.
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Something went wrong" });
});

export default app;
