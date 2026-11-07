/**
 * Vercel serverless entry point.
 *
 * A Vercel Node function is just a (req, res) handler, and an Express app is
 * exactly that, so the whole API runs as one function behind /api/*. There is
 * no app.listen here: Vercel owns the server.
 */
import app from "./app";

export default app;
