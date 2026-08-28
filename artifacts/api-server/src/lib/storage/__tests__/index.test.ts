import { describe, expect, it } from "vitest";
import { createMediaStore } from "../index";
import { LocalDiskStore } from "../local-disk";
import { ReplitObjectStore } from "../replit";
import { VercelBlobStore } from "../vercel-blob";

describe("createMediaStore", () => {
  it("usa o Vercel Blob quando BLOB_READ_WRITE_TOKEN está definido", () => {
    const store = createMediaStore({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" });

    expect(store).toBeInstanceOf(VercelBlobStore);
  });

  it("prefere o Vercel Blob quando as duas variáveis estão definidas", () => {
    const store = createMediaStore({
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x",
      PRIVATE_OBJECT_DIR: "/bucket/.private",
    });

    expect(store).toBeInstanceOf(VercelBlobStore);
  });

  it("usa o Object Storage do Replit quando só PRIVATE_OBJECT_DIR está definido", () => {
    const store = createMediaStore({ PRIVATE_OBJECT_DIR: "/bucket/.private" });

    expect(store).toBeInstanceOf(ReplitObjectStore);
  });

  it("cai no disco local quando nenhuma das duas está definida", () => {
    const store = createMediaStore({});

    expect(store).toBeInstanceOf(LocalDiskStore);
  });

  it("trata string vazia como não definida", () => {
    const store = createMediaStore({ BLOB_READ_WRITE_TOKEN: "", PRIVATE_OBJECT_DIR: "" });

    expect(store).toBeInstanceOf(LocalDiskStore);
  });
});
