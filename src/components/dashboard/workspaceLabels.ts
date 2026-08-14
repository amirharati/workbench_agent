export function formatProjectWorkspaceName(projectName: string, workspaceName: string): string {
  return `${projectName} — ${workspaceName}`;
}

export function formatGeneralWorkspaceName(projectName: string): string {
  return formatProjectWorkspaceName(projectName, 'General');
}
