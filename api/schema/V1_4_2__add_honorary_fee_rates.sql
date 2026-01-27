-- V1_4_1: Add HONORARY fee rates (0 kr) for all existing fiscal years
-- Honorary members do not pay membership fees

-- Insert HONORARY fee rate (0 kr) for all existing fiscal years
INSERT IGNORE INTO fee_rates (fiscal_year, member_type, fee_amount)
SELECT year, 'HONORARY', 0.00
FROM fiscal_years;
