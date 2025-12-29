/**
 * Configuration utilities for parsing and validating environment variables.
 */

/**
 * Parses an integer from an environment variable, with a fallback default value.
 * Throws an error if the resulting value is NaN.
 * 
 * @param envVarValue The value from process.env[VAR_NAME]
 * @param defaultValue The default value to use if envVarValue is undefined
 * @param name The name of the configuration variable (used for error messages)
 * @returns The parsed integer
 * @throws Error if the value is not a valid number
 */
export function parseEnvInt(
    envVarValue: string | undefined,
    defaultValue: string | number,
    name: string
): number {
    const valueToParse = envVarValue ?? String(defaultValue);
    const parsed = Number.parseInt(valueToParse, 10);

    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid configuration for ${name}: "${valueToParse}" is not a valid integer.`);
    }

    return parsed;
}

/**
 * Parses a boolean from an environment variable.
 * Converts 'true', '1', 'yes' to true, and 'false', '0', 'no' to false.
 * Case-insensitive.
 * 
 * @param envVarValue The value from process.env[VAR_NAME]
 * @param defaultValue The default value to use if envVarValue is undefined
 * @returns The parsed boolean
 */
export function parseEnvBool(
    envVarValue: string | undefined,
    defaultValue: boolean
): boolean {
    if (envVarValue === undefined) {
        return defaultValue;
    }

    const lowerValue = envVarValue.toLowerCase();
    if (['true', '1', 'yes'].includes(lowerValue)) {
        return true;
    }
    if (['false', '0', 'no'].includes(lowerValue)) {
        return false;
    }

    return defaultValue;
}
