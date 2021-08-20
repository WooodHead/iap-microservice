import pino from "pino";

const pjson = require("../package.json"); // eslint-disable-line @typescript-eslint/no-var-requires

export const getLogger = (name: string): pino.Logger => {
  return pino({
    name: name,
    level: process.env.LOG_LEVEL || "info",
    mixin() {
      return {
        version: pjson.version,
        node_env: process.env.NODE_ENV,
      };
    },
  });
};
