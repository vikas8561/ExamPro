const mongoose = require("mongoose");

// Profile photos used to sit on the User document. Students are owned by the
// university's database now and ExamPro never writes there, so the photo lives
// here instead, keyed by whichever principal it belongs to.
const ProfileSchema = new mongoose.Schema(
  {
    principalId: { type: String, required: true, unique: true },
    role: { type: String, enum: ["Student", "Mentor", "Admin"], required: true },
    profileImage: { type: String },
    profileImageSaved: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "profiles" }
);

module.exports = mongoose.model("Profile", ProfileSchema);
