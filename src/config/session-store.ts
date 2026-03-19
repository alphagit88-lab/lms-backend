import { TypeormStore } from "connect-typeorm";
import { Store } from "express-session";
import { AppDataSource } from "../config/data-source";
import { AppSession } from "../entities/AppSession";

let store: Store | null = null;

export const getSessionStore = (): Store => {
  if (!store) {
    store = new TypeormStore({
      cleanupLimit: 2,
      ttl: 86400,
    }).connect(AppDataSource.getRepository(AppSession));
  }
  return store;
};
