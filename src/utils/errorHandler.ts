/**
 * ErrorHandler - Centralized error handling with detailed messages
 * Provides user-friendly error messages and recovery suggestions
 */
import { logError } from "./logging.js";

export enum ErrorCategory {
  VALIDATION = "validation",
  SECURITY = "security",
  NETWORK = "network",
  BROWSER = "browser",
  DATABASE = "database",
  RATE_LIMIT = "rate_limit",
  AUTHENTICATION = "authentication",
  UNKNOWN = "unknown",
}

export interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  details?: string;
  suggestions: string[];
  errorCode: string;
  retryable: boolean;
}

export class ErrorHandler {
  private static errorMappings: Map<string, ErrorInfo> = new Map();

  static initialize(): void {
    this.registerCommonErrors();
  }

  private static registerCommonErrors(): void {
    // Validation Errors
    this.registerError({
      category: ErrorCategory.VALIDATION,
      message: "Invalid input provided",
      details: "The input does not meet the required format or constraints.",
      suggestions: [
        "Check that all required fields are provided",
        "Verify that the input values are within allowed limits",
        "Ensure the input format is correct (e.g., valid URL format)",
      ],
      errorCode: "VAL_001",
      retryable: false,
    });

    this.registerError({
      category: ErrorCategory.VALIDATION,
      message: "Query is too long",
      details: "The query exceeds the maximum allowed length.",
      suggestions: [
        "Try shortening your query",
        "Split into multiple searches",
        "Use more specific terms",
      ],
      errorCode: "VAL_002",
      retryable: false,
    });

    this.registerError({
      category: ErrorCategory.VALIDATION,
      message: "Empty query provided",
      details: "The query cannot be empty or contain only whitespace.",
      suggestions: [
        "Provide a meaningful search query",
        "Check for accidental whitespace characters",
      ],
      errorCode: "VAL_003",
      retryable: false,
    });

    // Security Errors
    this.registerError({
      category: ErrorCategory.SECURITY,
      message: "URL blocked by security policy",
      details: "The URL is blocked due to security restrictions (SSRF protection).",
      suggestions: [
        "Do not use localhost or 127.0.0.1 addresses",
        "Avoid private IP ranges (192.168.x.x, 10.x.x.x, 172.16.x.x)",
        "Use public, accessible URLs only",
      ],
      errorCode: "SEC_001",
      retryable: false,
    });

    this.registerError({
      category: ErrorCategory.SECURITY,
      message: "Authentication required",
      details: "API key authentication is required to access this resource.",
      suggestions: [
        "Set the MCP_API_KEY environment variable",
        "Ensure the API key is correct and valid",
        "Contact your administrator for access",
      ],
      errorCode: "SEC_002",
      retryable: false,
    });

    this.registerError({
      category: ErrorCategory.SECURITY,
      message: "Invalid API key provided",
      details: "The provided API key is invalid or expired.",
      suggestions: [
        "Verify the API key is correct",
        "Check if the API key has expired",
        "Generate a new API key if needed",
      ],
      errorCode: "SEC_003",
      retryable: false,
    });

    // Network Errors
    this.registerError({
      category: ErrorCategory.NETWORK,
      message: "Connection refused",
      details: "The remote server refused the connection.",
      suggestions: [
        "Check if the server is running",
        "Verify the URL is correct",
        "Try again in a few moments",
        "Check your network connection",
      ],
      errorCode: "NET_001",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.NETWORK,
      message: "Connection timeout",
      details: "The connection attempt timed out.",
      suggestions: [
        "Check your internet connection",
        "The remote server may be slow or unresponsive",
        "Try again later",
        "Use a VPN if you suspect network restrictions",
      ],
      errorCode: "NET_002",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.NETWORK,
      message: "DNS resolution failed",
      details: "Could not resolve the hostname.",
      suggestions: [
        "Check if the domain name is correct",
        "Verify your DNS settings",
        "Try using a different DNS server",
      ],
      errorCode: "NET_003",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.NETWORK,
      message: "Network error occurred",
      details: "An unexpected network error occurred.",
      suggestions: [
        "Check your internet connection",
        "Try again later",
        "Contact support if the issue persists",
      ],
      errorCode: "NET_004",
      retryable: true,
    });

    // Browser Errors
    this.registerError({
      category: ErrorCategory.BROWSER,
      message: "Browser initialization failed",
      details: "Failed to initialize the browser instance.",
      suggestions: [
        "Ensure Puppeteer dependencies are installed",
        "Check if enough system resources are available",
        "Try running with PERPLEXITY_SECURITY_DISABLED=true (development only)",
        "Verify Node.js version compatibility",
      ],
      errorCode: "BRW_001",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.BROWSER,
      message: "Browser initialization timeout",
      details: "Browser initialization took longer than expected.",
      suggestions: [
        "Increase available system resources",
        "Check for resource-intensive processes",
        "Try again with fewer concurrent requests",
      ],
      errorCode: "BRW_002",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.BROWSER,
      message: "Page not found (404)",
      details: "The requested page could not be found.",
      suggestions: [
        "Verify the URL is correct",
        "The page may have been moved or deleted",
        "Try searching for the content instead",
      ],
      errorCode: "BRW_003",
      retryable: false,
    });

    this.registerError({
      category: ErrorCategory.BROWSER,
      message: "Navigation failed",
      details: "Failed to navigate to the requested URL.",
      suggestions: [
        "Check if the URL is accessible",
        "The website may be experiencing issues",
        "Try a different URL",
      ],
      errorCode: "BRW_004",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.BROWSER,
      message: "Content extraction failed",
      details: "Failed to extract content from the page.",
      suggestions: [
        "The page may require JavaScript execution",
        "The content may be behind a login",
        "Try using a different extraction method",
      ],
      errorCode: "BRW_005",
      retryable: false,
    });

    // Database Errors
    this.registerError({
      category: ErrorCategory.DATABASE,
      message: "Database not initialized",
      details: "The database has not been initialized.",
      suggestions: [
        "Call initialize() before using the database",
        "Check database configuration",
        "Ensure write permissions",
      ],
      errorCode: "DB_001",
      retryable: false,
    });

    this.registerError({
      category: ErrorCategory.DATABASE,
      message: "Database connection failed",
      details: "Failed to connect to the database.",
      suggestions: [
        "Check if the database file exists",
        "Ensure write permissions",
        "Verify database path configuration",
      ],
      errorCode: "DB_002",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.DATABASE,
      message: "Database query failed",
      details: "Failed to execute the database query.",
      suggestions: [
        "Check if the database is corrupted",
        "Verify the query parameters",
        "Try reinitializing the database",
      ],
      errorCode: "DB_003",
      retryable: false,
    });

    // Rate Limit Errors
    this.registerError({
      category: ErrorCategory.RATE_LIMIT,
      message: "Rate limit exceeded",
      details: "Too many requests have been made. Please wait before retrying.",
      suggestions: [
        "Wait a few moments before retrying",
        "Reduce request frequency",
        "Use request batching if available",
      ],
      errorCode: "RATE_001",
      retryable: true,
    });

    this.registerError({
      category: ErrorCategory.RATE_LIMIT,
      message: "Queue is full",
      details: "The request queue is currently full.",
      suggestions: [
        "Wait for pending requests to complete",
        "Retry in a few moments",
        "Reduce request rate",
      ],
      errorCode: "RATE_002",
      retryable: true,
    });

    // Authentication Errors
    this.registerError({
      category: ErrorCategory.AUTHENTICATION,
      message: "Unauthorized access",
      details: "The request requires authentication.",
      suggestions: [
        "Provide valid API credentials",
        "Check if your API key is authorized",
        "Contact support for access",
      ],
      errorCode: "AUTH_001",
      retryable: false,
    });
  }

  private static registerError(errorInfo: ErrorInfo): void {
    this.errorMappings.set(errorInfo.errorCode, errorInfo);
  }

  static handle(error: unknown, context?: string): string {
    let errorInfo: ErrorInfo;

    if (error instanceof Error) {
      errorInfo = this.classifyError(error);
    } else {
      errorInfo = this.errorMappings.get("UNKNOWN_001") ?? {
        category: ErrorCategory.UNKNOWN,
        message: "An unknown error occurred",
        details: String(error),
        suggestions: ["Try again later", "Contact support if the issue persists"],
        errorCode: "UNKNOWN_001",
        retryable: false,
      };
    }

    const formattedError = this.formatError(errorInfo, context);
    logError(formattedError, {
      originalError: error instanceof Error ? error.message : String(error),
    });

    return formattedError;
  }

  private static classifyError(error: Error): ErrorInfo {
    const errorMessage = error.message.toLowerCase();

    if (
      errorMessage.includes("validation") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("empty")
    ) {
      return (
        this.errorMappings.get("VAL_001") ?? {
          category: ErrorCategory.VALIDATION,
          message: "Validation error",
          details: error.message,
          suggestions: ["Check your input values"],
          errorCode: "VAL_001",
          retryable: false,
        }
      );
    }

    if (
      errorMessage.includes("security") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("forbidden")
    ) {
      return (
        this.errorMappings.get("SEC_001") ?? {
          category: ErrorCategory.SECURITY,
          message: "Security error",
          details: error.message,
          suggestions: ["Check your permissions and credentials"],
          errorCode: "SEC_001",
          retryable: false,
        }
      );
    }

    if (errorMessage.includes("timeout") || errorMessage.includes("etimedout")) {
      return (
        this.errorMappings.get("NET_002") ?? {
          category: ErrorCategory.NETWORK,
          message: "Timeout error",
          details: error.message,
          suggestions: ["Try again later"],
          errorCode: "NET_002",
          retryable: true,
        }
      );
    }

    if (errorMessage.includes("econnrefused")) {
      return (
        this.errorMappings.get("NET_001") ?? {
          category: ErrorCategory.NETWORK,
          message: "Connection refused",
          details: error.message,
          suggestions: ["Check if the server is running"],
          errorCode: "NET_001",
          retryable: true,
        }
      );
    }

    if (errorMessage.includes("enotfound")) {
      return (
        this.errorMappings.get("NET_003") ?? {
          category: ErrorCategory.NETWORK,
          message: "DNS resolution failed",
          details: error.message,
          suggestions: ["Check the URL and DNS settings"],
          errorCode: "NET_003",
          retryable: true,
        }
      );
    }

    if (errorMessage.includes("browser") || errorMessage.includes("puppeteer")) {
      return (
        this.errorMappings.get("BRW_001") ?? {
          category: ErrorCategory.BROWSER,
          message: "Browser error",
          details: error.message,
          suggestions: ["Check browser initialization and dependencies"],
          errorCode: "BRW_001",
          retryable: true,
        }
      );
    }

    if (errorMessage.includes("database") || errorMessage.includes("sqlite")) {
      return (
        this.errorMappings.get("DB_001") ?? {
          category: ErrorCategory.DATABASE,
          message: "Database error",
          details: error.message,
          suggestions: ["Check database connection and permissions"],
          errorCode: "DB_001",
          retryable: true,
        }
      );
    }

    return {
      category: ErrorCategory.UNKNOWN,
      message: "An unexpected error occurred",
      details: error.message,
      suggestions: ["Try again later", "Contact support if the issue persists"],
      errorCode: "UNKNOWN_001",
      retryable: false,
    };
  }

  private static formatError(errorInfo: ErrorInfo, context?: string): string {
    const lines: string[] = [];

    lines.push(`❌ ${errorInfo.message} [${errorInfo.errorCode}]`);

    if (context) {
      lines.push(`Context: ${context}`);
    }

    if (errorInfo.details) {
      lines.push(`\nDetails: ${errorInfo.details}`);
    }

    if (errorInfo.suggestions.length > 0) {
      lines.push("\nSuggestions:");
      errorInfo.suggestions.forEach((suggestion, index) => {
        lines.push(`  ${index + 1}. ${suggestion}`);
      });
    }

    if (errorInfo.retryable) {
      lines.push(`\nℹ️ This error is retryable. Consider retrying the operation.`);
    }

    return lines.join("\n");
  }

  static isRetryable(error: Error): boolean {
    const errorInfo = this.classifyError(error);
    return errorInfo.retryable;
  }

  static getErrorCategory(error: Error): ErrorCategory {
    const errorInfo = this.classifyError(error);
    return errorInfo.category;
  }

  static createError(code: string, originalError?: Error): Error {
    const errorInfo = this.errorMappings.get(code);

    if (!errorInfo) {
      return new Error(`Unknown error code: ${code}`);
    }

    const message = this.formatError(errorInfo);
    const newError = new Error(message) as Error & { code: string; category: ErrorCategory };

    newError.code = code;
    newError.category = errorInfo.category;
    newError.stack = originalError?.stack;

    return newError;
  }
}
