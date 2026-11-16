interface ImportMetaEnv {
  /** Repository URL (for example, https://github.com/owner/repo), set by the deployment workflow. */
  readonly VITE_REPOSITORY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
