export interface SftpEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  mtime?: number;
}

