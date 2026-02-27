export class CommissionService {
    // Default: 10% (can be overridden by PLATFORM_COMMISSION_RATE env var)
    static readonly DEFAULT_COMMISSION_RATE = process.env.PLATFORM_COMMISSION_RATE
        ? parseFloat(process.env.PLATFORM_COMMISSION_RATE)
        : 0.10;

    /**
     * Calculates the split between the platform fee and teacher earnings
     */
    static calculate(amount: number, customRate?: number): { teacherAmount: number; platformFee: number } {
        const rate = customRate ?? this.DEFAULT_COMMISSION_RATE;
        const platformFee = Math.round(amount * rate * 100) / 100;
        const teacherAmount = amount - platformFee;

        return { teacherAmount, platformFee };
    }
}
