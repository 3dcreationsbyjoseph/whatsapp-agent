#!/usr/bin/env node
// Genera una clave AES-256-GCM (32 bytes) en base64.
// Uso: pnpm gen:key
import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");
console.log(key);
