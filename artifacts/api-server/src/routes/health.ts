import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { botStatus } from "../bot/runtime";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, bot: botStatus() });
});

export default router;
