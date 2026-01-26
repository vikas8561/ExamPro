
const mongoose = require('mongoose');
const User = require('./models/User');
const Assignment = require('./models/Assignment');
const Test = require('./models/Test');
const fs = require('fs');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const log = (msg) => {
            console.log(msg);
            fs.appendFileSync('debug_output.txt', msg + '\n');
        };

        // Clear previous log
        fs.writeFileSync('debug_output.txt', '');

        log('Connected to DB');

        // Find a student
        const student = await User.findOne({ role: 'Student' });
        if (!student) {
            log('No student found');
            return;
        }
        log(`Checking assignments for: ${student.email} (${student._id})`);

        // Fetch assignments without filtering
        const assignments = await Assignment.find({ userId: student._id })
            .populate('testId')
            .sort({ createdAt: -1 });

        log(`Found ${assignments.length} assignments in MongoDB.`);

        assignments.forEach((a, i) => {
            if (!a.testId) {
                log(`${i + 1}. [Missing Test] Status: ${a.status} | CreatedAt: ${a.createdAt}`);
            } else {
                log(`${i + 1}. Test: "${a.testId.title}" | Type: "${a.testId.type}" | Status: ${a.status} | CreatedAt: ${a.createdAt.toISOString()} | StartTime: ${a.startTime.toISOString()}`);
            }
        });

    } catch (e) {
        fs.appendFileSync('debug_output.txt', e.toString() + '\n');
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
};

run();
