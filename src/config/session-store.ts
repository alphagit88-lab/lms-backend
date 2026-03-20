import { TypeormStore } from "connect-typeorm";
import { Store } from "express-session";
import { AppDataSource } from "../config/data-source";
import { AppSession } from "../entities/AppSession";

/**
 * A Proxy store that waits for the TypeORM Data Source to be initialized
 * before attempting to access the repository.
 * This prevents the "Repository not found" error during startup on Vercel.
 */
class LazyTypeormStore extends Store {
  private innerStore: TypeormStore | null = null;

  private getStore(): TypeormStore {
    if (!this.innerStore) {
      if (!AppDataSource.isInitialized) {
        throw new Error("Database not initialized yet. Lazy session store cannot be accessed.");
      }
      this.innerStore = new TypeormStore({
        cleanupLimit: 2,
        ttl: 86400,
      }).connect(AppDataSource.getRepository(AppSession));
    }
    return this.innerStore;
  }

  public get = (sid: string, callback: (err: any, session?: any) => void) => {
    try {
      this.getStore().get(sid, callback);
    } catch (e) {
      callback(e);
    }
  };

  public set = (sid: string, session: any, callback?: (err?: any) => void) => {
    try {
      this.getStore().set(sid, session, callback);
    } catch (e) {
      if (callback) callback(e);
    }
  };

  public destroy = (sid: string, callback?: (err?: any) => void) => {
    try {
      this.getStore().destroy(sid, callback);
    } catch (e) {
      if (callback) callback(e);
    }
  };
  
  // Implement other required methods for a Store if necessary
  public touch = (sid: string, session: any, callback?: (err?: any) => void) => {
      try {
          this.getStore().touch(sid, session, callback);
      } catch (e) {
          if (callback) callback(e);
      }
  }
}

const instance = new LazyTypeormStore();
export const getSessionStore = () => instance;
