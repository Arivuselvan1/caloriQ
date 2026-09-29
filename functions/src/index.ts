import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

admin.initializeApp();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

export { analyzeFood } from "./analyzeFood";
export { generateSummary } from "./generateSummary";
