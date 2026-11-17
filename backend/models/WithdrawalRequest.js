import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
    request_id: {
        type: String,
        unique: true,
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'userType',
        required: true
    },
    userType: {
        type: String,
        enum: ['User', 'Scrapper'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    // State machine: PENDING -> APPROVED -> PROCESSED
    //                PENDING -> REJECTED (refunds reserved funds)
    //                APPROVED -> FAILED  (payout attempt failed; refunds)
    // PROCESSED / REJECTED / FAILED are terminal.
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED'],
        default: 'PENDING'
    },
    // Ledger row that reserved the funds (enables exact refund on rejection).
    walletTrxId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WalletTransaction',
        default: null
    },
    bankDetails: {
        accountHolderName: String,
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        upiId: String,
        method: {
            type: String,
            enum: ['BANK_TRANSFER', 'UPI'],
            required: true
        }
    },
    adminNotes: {
        type: String
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Admin user
    },
    processedAt: {
        type: Date
    },
    transactionId: {
        type: String
    }
}, {
    timestamps: true
});

withdrawalRequestSchema.index({ user: 1, status: 1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });

const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
export default WithdrawalRequest;
