import { notFound } from "next/navigation";

export default function FilesPage() {
  // Removed: file management UI should not be exposed from admin.
  notFound();
}
