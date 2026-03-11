"use client";

/**
 * Client-side file upload utilities
 * Uses signed URLs from server to upload files to Supabase Storage
 * This bypasses Server Action body size limits
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
  fileSize?: number;
}

/**
 * Upload file to storage with progress tracking
 * Supports both Supabase (signed URL) and CloudBase (direct upload)
 * @param file - File to upload
 * @param bucket - Storage bucket name
 * @param path - File path in bucket
 * @param onProgress - Optional progress callback
 */
export async function uploadToStorage(
  file: File,
  bucket: string,
  path: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Check if domestic version (CloudBase)
    const isDomestic = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION !== "INTL";

    if (isDomestic) {
      // CloudBase: Direct upload with progress
      return await uploadDirect(file, bucket, path, onProgress);
    } else {
      // Supabase: Signed URL upload with progress
      return await uploadWithSignedUrl(file, bucket, path, onProgress);
    }
  } catch (err) {
    console.error("Upload exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

/**
 * Upload to Supabase using signed URL
 */
async function uploadWithSignedUrl(
  file: File,
  bucket: string,
  path: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  // Step 1: Get signed upload URL from server
  const signedUrlResponse = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, path }),
  });

  if (!signedUrlResponse.ok) {
    const error = await signedUrlResponse.json();
    return { success: false, error: error.error || "获取上传链接失败" };
  }

  const { signedUrl, publicUrl } = await signedUrlResponse.json();

  // Step 2: Upload file using signed URL with progress tracking
  return await uploadWithProgress(file, signedUrl, publicUrl, onProgress);
}

/**
 * Upload directly to CloudBase with progress
 */
async function uploadDirect(
  file: File,
  bucket: string,
  path: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });
    }

    xhr.addEventListener("load", async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve({
            success: true,
            url: response.url,
            fileSize: response.fileSize,
          });
        } catch (err) {
          resolve({ success: false, error: "Invalid response format" });
        }
      } else {
        let errorMessage = "Upload failed";
        try {
          const response = JSON.parse(xhr.responseText);
          errorMessage = response.error || errorMessage;
        } catch {
          // ignore parse error
        }
        resolve({ success: false, error: errorMessage });
      }
    });

    xhr.addEventListener("error", () => {
      resolve({ success: false, error: "Network error during upload" });
    });

    // Prepare form data
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);
    formData.append("path", path);

    // Send request
    xhr.open("POST", "/api/admin/upload");
    xhr.send(formData);
  });
}

/**
 * Upload with progress tracking using XMLHttpRequest
 */
async function uploadWithProgress(
  file: File,
  signedUrl: string,
  publicUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
          });
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          success: true,
          url: publicUrl,
          fileSize: file.size,
        });
      } else {
        let errorMessage = "Upload failed";
        try {
          const response = JSON.parse(xhr.responseText);
          errorMessage = response.error || response.message || errorMessage;
        } catch {
          // ignore parse error
        }
        resolve({ success: false, error: errorMessage });
      }
    });

    xhr.addEventListener("error", () => {
      resolve({ success: false, error: "Network error during upload" });
    });

    xhr.addEventListener("abort", () => {
      resolve({ success: false, error: "Upload cancelled" });
    });

    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.send(file);
  });
}

/**
 * Generate a unique file path for releases
 */
export function generateReleasePath(
  platform: string,
  variant: string | null,
  version: string,
  fileName: string
): string {
  const ext = fileName.split(".").pop() || "";
  const timestamp = Date.now();
  return `${platform}-${variant || "default"}-${version}-${timestamp}.${ext}`;
}
