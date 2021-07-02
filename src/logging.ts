import pino from "pino";

export const getLogger = (name: string): pino.Logger => {
  return pino({
    name: name,
    level: process.env.LOG_LEVEL || "info",
  });
};
