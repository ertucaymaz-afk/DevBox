const NVIDIA_CREDENTIAL_NAMES = [
  "NVIDIA_API_KEY",
  "NVİDİA_API_KEY"
] as const;

export type DiscoveredCredential = {
  value: string;
  variableName: string;
  source: "process-environment";
};

export function discoverNvidiaCredential(environment: NodeJS.ProcessEnv = process.env): DiscoveredCredential | null {
  for (const variableName of NVIDIA_CREDENTIAL_NAMES) {
    const value = environment[variableName]?.trim();
    if (value) return { value, variableName, source: "process-environment" };
  }

  return null;
}

export function describeCredential(credential: DiscoveredCredential | null): string {
  if (!credential) return "NVIDIA kimlik bilgisi bulunamadı.";
  return credential.variableName === "NVIDIA_API_KEY"
    ? "Standart NVIDIA_API_KEY süreç ortamından güvenli biçimde keşfedildi."
    : "Eski Unicode NVIDIA ortam değişkeni süreç ortamından keşfedildi ve yalnızca child process için standart NVIDIA_API_KEY adına eşlendi.";
}
