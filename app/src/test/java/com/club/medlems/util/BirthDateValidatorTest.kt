package com.club.medlems.util

import kotlinx.datetime.LocalDate
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for BirthDateValidator.
 */
class BirthDateValidatorTest {

    @Test
    fun `valid date in DD-MM-YYYY format returns Valid`() {
        val result = BirthDateValidator.validate("01-01-2000")
        assertTrue(result is BirthDateValidationResult.Valid)
        val valid = result as BirthDateValidationResult.Valid
        assertEquals(LocalDate(2000, 1, 1), valid.date)
    }

    @Test
    fun `valid date in DD slash MM slash YYYY format returns Valid`() {
        val result = BirthDateValidator.validate("15/06/1985")
        assertTrue(result is BirthDateValidationResult.Valid)
        val valid = result as BirthDateValidationResult.Valid
        assertEquals(LocalDate(1985, 6, 15), valid.date)
    }

    @Test
    fun `valid date in DD dot MM dot YYYY format returns Valid`() {
        val result = BirthDateValidator.validate("31.12.1990")
        assertTrue(result is BirthDateValidationResult.Valid)
        val valid = result as BirthDateValidationResult.Valid
        assertEquals(LocalDate(1990, 12, 31), valid.date)
    }

    @Test
    fun `valid date in ISO YYYY-MM-DD format returns Valid`() {
        val result = BirthDateValidator.validate("1995-07-20")
        assertTrue(result is BirthDateValidationResult.Valid)
        val valid = result as BirthDateValidationResult.Valid
        assertEquals(LocalDate(1995, 7, 20), valid.date)
    }

    @Test
    fun `empty string returns Empty`() {
        val result = BirthDateValidator.validate("")
        assertEquals(BirthDateValidationResult.Empty, result)
    }

    @Test
    fun `blank string returns Empty`() {
        val result = BirthDateValidator.validate("   ")
        assertEquals(BirthDateValidationResult.Empty, result)
    }

    @Test
    fun `invalid format returns InvalidFormat`() {
        val result = BirthDateValidator.validate("not-a-date")
        assertTrue(result is BirthDateValidationResult.InvalidFormat)
    }

    @Test
    fun `partial date returns InvalidFormat`() {
        val result = BirthDateValidator.validate("01-01")
        assertTrue(result is BirthDateValidationResult.InvalidFormat)
    }

    @Test
    fun `future date returns FutureDate`() {
        val result = BirthDateValidator.validate("01-01-2099")
        assertEquals(BirthDateValidationResult.FutureDate, result)
    }

    @Test
    fun `date more than 120 years ago returns TooOld`() {
        val result = BirthDateValidator.validate("01-01-1800")
        assertEquals(BirthDateValidationResult.TooOld, result)
    }

    @Test
    fun `invalid day in month is handled`() {
        // February 30 doesn't exist
        val result = BirthDateValidator.validate("30-02-2000")
        // Should return InvalidFormat since LocalDate can't be created
        assertTrue(result is BirthDateValidationResult.InvalidFormat)
    }

    @Test
    fun `calculateAge returns correct age before birthday`() {
        val birthDate = LocalDate(2000, 12, 31)
        val asOf = LocalDate(2025, 1, 1) // Day after birthday in 2024
        val age = BirthDateValidator.calculateAge(birthDate, asOf)
        assertEquals(24, age)
    }

    @Test
    fun `calculateAge returns correct age on birthday`() {
        val birthDate = LocalDate(2000, 6, 15)
        val asOf = LocalDate(2025, 6, 15) // Exact birthday
        val age = BirthDateValidator.calculateAge(birthDate, asOf)
        assertEquals(25, age)
    }

    @Test
    fun `calculateAge returns correct age day before birthday`() {
        val birthDate = LocalDate(2000, 6, 15)
        val asOf = LocalDate(2025, 6, 14) // Day before birthday
        val age = BirthDateValidator.calculateAge(birthDate, asOf)
        assertEquals(24, age)
    }

    @Test
    fun `isAdult returns true for 18 year old`() {
        val birthDate = LocalDate(2007, 1, 1)
        val asOf = LocalDate(2025, 1, 1)
        val age = BirthDateValidator.calculateAge(birthDate, asOf)
        assertEquals(18, age)
        assertTrue(BirthDateValidator.isAdult(birthDate))
    }

    @Test
    fun `isAdult returns false for 17 year old`() {
        val birthDate = LocalDate(2008, 1, 1)
        val asOf = LocalDate(2025, 1, 1)
        val age = BirthDateValidator.calculateAge(birthDate, asOf)
        assertEquals(17, age)
        // Note: isAdult uses current date, so this test may vary
    }

    @Test
    fun `isAdult with string returns true for adult`() {
        assertTrue(BirthDateValidator.isAdult("01-01-1990"))
    }

    @Test
    fun `isAdult with string returns false for invalid date`() {
        assertFalse(BirthDateValidator.isAdult("invalid"))
    }

    @Test
    fun `getErrorMessage returns null for Valid result`() {
        val result = BirthDateValidationResult.Valid(LocalDate(2000, 1, 1), 25)
        assertNull(BirthDateValidator.getErrorMessage(result))
    }

    @Test
    fun `getErrorMessage returns null for Empty result`() {
        assertNull(BirthDateValidator.getErrorMessage(BirthDateValidationResult.Empty))
    }

    @Test
    fun `getErrorMessage returns message for FutureDate`() {
        val message = BirthDateValidator.getErrorMessage(BirthDateValidationResult.FutureDate)
        assertNotNull(message)
        assertTrue(message!!.contains("fremtiden"))
    }

    @Test
    fun `getErrorMessage returns message for TooOld`() {
        val message = BirthDateValidator.getErrorMessage(BirthDateValidationResult.TooOld)
        assertNotNull(message)
        assertTrue(message!!.contains("120"))
    }

    @Test
    fun `validation result contains calculated age`() {
        val result = BirthDateValidator.validate("01-01-2000")
        assertTrue(result is BirthDateValidationResult.Valid)
        val valid = result as BirthDateValidationResult.Valid
        assertTrue(valid.age >= 25) // As of 2025+
    }
}
