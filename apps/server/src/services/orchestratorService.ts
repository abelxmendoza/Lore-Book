import { spawnPython } from "../utils/pythonBridge";

export const runOrchestrator =
  (mode: string) =>
  async (req, res) => {
    const userId = req.user.id;

    const payload = await spawnPython("orchestrator", {
      mode,
      userId,
      id: req.params.id,
      query: req.query.query,
      memoryId: req.params.memoryId,
    });

    res.json(payload);
  };
