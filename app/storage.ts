import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

function dataDir() {
  return process.env.DATA_DIR || join(process.cwd(), ".data");
}

function evidenceRoot() {
  return join(dataDir(), "evidencias");
}

function evidencePath(key: string) {
  const root = evidenceRoot();
  const fullPath = normalize(join(root, key));
  if (!fullPath.startsWith(root)) {
    throw new Error("Ruta de evidencia no valida.");
  }
  return fullPath;
}

export async function saveEvidenceFile(key: string, file: File) {
  const fullPath = evidencePath(key);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, Buffer.from(await file.arrayBuffer()));
}

export async function readEvidenceFile(key: string) {
  return readFile(evidencePath(key));
}

export async function deleteEvidenceFile(key: string) {
  try {
    await unlink(evidencePath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
