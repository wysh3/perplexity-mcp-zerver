/**
 * URL Security Manager to prevent SSRF attacks
 * Validates URLs against security policies before fetching
 */

export class URLSecurityManager {
  private blockedDomains = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.ec2.internal",
    "169.254.169.254",
  ]);

  private allowedSchemes = new Set(["http:", "https:"]);

  validateURL(url: string): { valid: boolean; reason?: string } {
    try {
      const parsed = new URL(url);

      if (!this.allowedSchemes.has(parsed.protocol)) {
        return { valid: false, reason: `Protocol ${parsed.protocol} not allowed` };
      }

      const hostname = parsed.hostname.toLowerCase();

      if (this.blockedDomains.has(hostname)) {
        return { valid: false, reason: `Domain ${hostname} blocked` };
      }

      if (this.isPrivateIP(hostname)) {
        return { valid: false, reason: "Private IP not allowed" };
      }

      if (this.isReservedIP(hostname)) {
        return { valid: false, reason: "Reserved IP not allowed" };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: "Invalid URL format" };
    }
  }

  private isPrivateIP(hostname: string): boolean {
    return (
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^fc00:/i.test(hostname) ||
      /^fe80:/i.test(hostname)
    );
  }

  private isReservedIP(hostname: string): boolean {
    return (
      /^0\./.test(hostname) ||
      /^127\./.test(hostname) ||
      /^224\./.test(hostname) ||
      /^240\./.test(hostname) ||
      /^ff00:/i.test(hostname) ||
      hostname === "::"
    );
  }
}

export const urlSecurity = new URLSecurityManager();
