const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["Student", "Mentor", "Admin"],
      default: "Student",
    },
    activeSessions: [{ type: String }], // Array to store active session tokens
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    pendingPassword: { type: String }, // Temporary storage for new password
    pendingEmail: { type: String }, // Temporary storage for new email
    // status: {
    //   type: String,
    //   enum: ["Active", "Inactive"],
    //   default: "Active",
    // },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("User", userSchema);
