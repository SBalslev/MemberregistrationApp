package com.club.medlems

import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavHostController
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class BackNavigationTest {
    private fun entry(id: String): NavBackStackEntry = mock<NavBackStackEntry>().also {
        whenever(it.id).thenReturn(id)
    }

    @Test
    fun `Back returns to the previous screen`() {
        val controller: NavHostController = mock()
        val screen = entry("activities")
        val parent = entry("dashboard")
        whenever(controller.currentBackStackEntry).thenReturn(screen)
        whenever(controller.previousBackStackEntry).thenReturn(parent)
        whenever(controller.popBackStack()).thenReturn(true)

        assertTrue(controller.navigateBackFrom(screen))
        verify(controller).popBackStack()
    }

    @Test
    fun `Back never removes the final destination`() {
        val controller: NavHostController = mock()
        val dashboard = entry("dashboard")
        whenever(controller.currentBackStackEntry).thenReturn(dashboard)
        whenever(controller.previousBackStackEntry).thenReturn(null)

        assertFalse(controller.navigateBackFrom(dashboard))
        verify(controller, never()).popBackStack()
    }

    @Test
    fun `repeated Back from a closing screen only pops once`() {
        val controller: NavHostController = mock()
        val screen = entry("checkout")
        val parent = entry("equipment")
        whenever(controller.currentBackStackEntry).thenReturn(screen, parent)
        whenever(controller.previousBackStackEntry).thenReturn(parent)
        whenever(controller.popBackStack()).thenReturn(true)

        assertTrue(controller.navigateBackFrom(screen))
        assertFalse(controller.navigateBackFrom(screen))
        verify(controller, times(1)).popBackStack()
    }

    @Test
    fun `completion from a replaced screen cannot pop its replacement`() {
        val controller: NavHostController = mock()
        val scanScreen = entry("scan-checkout")
        val current = entry("manual-checkout")
        val parent = entry("equipment")
        whenever(controller.currentBackStackEntry).thenReturn(current)
        whenever(controller.previousBackStackEntry).thenReturn(parent)

        assertFalse(controller.navigateBackFrom(scanScreen))
        verify(controller, never()).popBackStack()
    }

    @Test
    fun `Back is ignored when no destination is active`() {
        val controller: NavHostController = mock()
        whenever(controller.currentBackStackEntry).thenReturn(null)

        assertFalse(controller.navigateBackFrom(entry("old-screen")))
        verify(controller, never()).popBackStack()
    }
}
