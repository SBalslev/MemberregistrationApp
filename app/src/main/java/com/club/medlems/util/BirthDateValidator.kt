package com.club.medlems.util

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

/**
 * Validation result for birth date input.
 */
sealed class BirthDateValidationResult {
    /** Birth date is valid */
    data class Valid(val date: LocalDate, val age: Int) : BirthDateValidationResult()

    /** Birth date input is empty (may or may not be required) */
    object Empty : BirthDateValidationResult()

    /** Birth date format is invalid */
    data class InvalidFormat(val message: String) : BirthDateValidationResult()

    /** Birth date is in the future */
    object FutureDate : BirthDateValidationResult()

    /** Age exceeds reasonable maximum (120 years) */
    object TooOld : BirthDateValidationResult()

    /** Date values are invalid (e.g., Feb 30) */
    data class InvalidDate(val message: String) : BirthDateValidationResult()
}

/**
 * Validator for birth date input with multiple format support.
 *
 * Supports formats:
 * - DD-MM-YYYY (Danish standard)
 * - DD/MM/YYYY
 * - DD.MM.YYYY
 * - YYYY-MM-DD (ISO)
 *
 * Validation rules:
 * - Date must be in the past
 * - Age must not exceed 120 years
 * - Date must be a valid calendar date
 */
object BirthDateValidator {
    private const val MAX_AGE = 120

    /**
     * Validate a birth date string.
     *
     * @param input The birth date string to validate
     * @return Validation result with parsed date and age if valid
     */
    fun validate(input: String): BirthDateValidationResult {
        if (input.isBlank()) {
            return BirthDateValidationResult.Empty
        }

        val trimmedInput = input.trim()

        // Try parsing with different formats
        val date = tryParseDate(trimmedInput)
            ?: return BirthDateValidationResult.InvalidFormat(
                "Ugyldig datoformat. Brug DD-MM-ÅÅÅÅ"
            )

        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())

        // Check if date is in the future
        if (date > today) {
            return BirthDateValidationResult.FutureDate
        }

        // Calculate age
        val age = calculateAge(date, today)

        // Check if age exceeds maximum
        if (age > MAX_AGE) {
            return BirthDateValidationResult.TooOld
        }

        return BirthDateValidationResult.Valid(date, age)
    }

    /**
     * Try to parse a date string using multiple formats.
     */
    private fun tryParseDate(input: String): LocalDate? {
        // Try ISO format first (YYYY-MM-DD)
        try {
            return LocalDate.parse(input)
        } catch (_: Exception) { }

        // Try Danish/European formats (DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY)
        val separators = listOf("-", "/", ".")
        for (sep in separators) {
            val parts = input.split(sep)
            if (parts.size == 3) {
                try {
                    val first = parts[0].toIntOrNull() ?: continue
                    val second = parts[1].toIntOrNull() ?: continue
                    val third = parts[2].toIntOrNull() ?: continue

                    // Determine format based on first part
                    return if (first > 31) {
                        // YYYY-MM-DD format
                        LocalDate(first, second, third)
                    } else {
                        // DD-MM-YYYY format
                        LocalDate(third, second, first)
                    }
                } catch (_: Exception) { }
            }
        }

        return null
    }

    /**
     * Calculate age from birth date.
     */
    fun calculateAge(birthDate: LocalDate, asOf: LocalDate = Clock.System.todayIn(TimeZone.currentSystemDefault())): Int {
        var age = asOf.year - birthDate.year

        // Adjust if birthday hasn't occurred yet this year
        if (asOf.monthNumber < birthDate.monthNumber ||
            (asOf.monthNumber == birthDate.monthNumber && asOf.dayOfMonth < birthDate.dayOfMonth)) {
            age--
        }

        return age
    }

    /**
     * Check if a person is an adult (18 or older).
     */
    fun isAdult(birthDate: LocalDate): Boolean {
        return calculateAge(birthDate) >= 18
    }

    /**
     * Check if a person is an adult based on birth date string.
     * Returns false if date is invalid or person is under 18.
     */
    fun isAdult(birthDateString: String): Boolean {
        return when (val result = validate(birthDateString)) {
            is BirthDateValidationResult.Valid -> result.age >= 18
            else -> false
        }
    }

    /**
     * Get a user-friendly error message for a validation result.
     */
    fun getErrorMessage(result: BirthDateValidationResult): String? {
        return when (result) {
            is BirthDateValidationResult.Valid -> null
            is BirthDateValidationResult.Empty -> null  // Empty is not an error unless required
            is BirthDateValidationResult.InvalidFormat -> result.message
            is BirthDateValidationResult.FutureDate -> "Fødselsdato kan ikke være i fremtiden"
            is BirthDateValidationResult.TooOld -> "Fødselsdato giver en alder over 120 år"
            is BirthDateValidationResult.InvalidDate -> result.message
        }
    }
}
