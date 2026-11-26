import { toLog } from "@kitsune/common";
import axios from "axios";

export const LogNet = (baseURL: string, path: string = "/log") => {
  const api = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'text/plain',
    },
  });

  const queue: string[] = [];

  setInterval(async () => {
    while(queue.length) {
      const message = queue.shift();

      try {
        if(message !== undefined)
          await api.post(path, message.slice(0, 10000), { headers: { "Content-Type": "text/plain" } });
      } catch(e) {
        // Do nothing
      }
    }
  }, 0);

  return (...values: any[]) => {
    const message = toLog(...values);
    queue.push(message);
  };
};
