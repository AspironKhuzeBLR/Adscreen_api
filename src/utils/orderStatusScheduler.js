const cron = require('node-cron');
const supabase = require('../config/supabase'); // Adjust the path to your supabase client config

const runDailyLifecycleUpdate = async () => {
    console.log(`[Scheduler - Midnight] Running daily lifecycle job at ${new Date().toISOString()}`);

    try {
        const now = new Date().toISOString();

        const { count: inDisplayCount, error: inDisplayError } = await supabase
            .from("orders")
            .update({ status: "In Display" })
            .eq("status", "Pending Display Approval")
            .filter("start_date", "lte", "now()"); 
    

        console.log("now", now);
        console.log("inDisplayCount", inDisplayCount);

        if (inDisplayError) console.error("[Scheduler - Midnight] Error updating 'In Display' orders:", inDisplayError.message);
        else console.log(`[Scheduler - Midnight] Successfully updated ${inDisplayCount || 0} orders to 'In Display'.`);

        const { count: completedCount, error: completedError } = await supabase
            .from("orders")
            .update({ status: "Completed" })
            .eq("status", "In Display")
            .filter("end_date", "lt", "now()"); 

        if (completedError) console.error("[Scheduler - Midnight] Error updating 'Completed' orders:", completedError.message);
        else console.log(`[Scheduler - Midnight] Successfully updated ${completedCount || 0} orders to 'Completed'.`);

    } catch (err) {
        console.error("[Scheduler - Midnight] A critical error occurred during the lifecycle job:", err.message);
    }
};


const runForfeitureCheck = async () => {
    console.log(`[Scheduler - Noon] Running forfeiture check job at ${new Date().toISOString()}`);
    try {
        // 1. Define the cutoff point. The simplest way is to find the start of
        // the day AFTER tomorrow in UTC. This will safely include all of today and all of tomorrow.
        const dayAfterTomorrow = new Date();
        dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);
        dayAfterTomorrow.setUTCHours(0, 0, 0, 0); // Start of the day

        const forfeitCutoff = dayAfterTomorrow.toISOString();
        console.log(`[Scheduler] Cancelling 'Design Revise' orders with a start_date before ${forfeitCutoff}`);

        // 2. Find orders that are in 'Design Revise' AND their start date has passed
        // the noon deadline (i.e., their start_date is today or tomorrow).
        const { count: forfeitedCount, error: forfeitedError } = await supabase
            .from("orders")
            .update({ status: "Cancelled - Forfeited" })
            .eq("status", "Design Revise")
            .lt("start_date", forfeitCutoff); // Finds anything less than the day after tomorrow.

        if (forfeitedError) {
            console.error("[Scheduler] Error updating 'Forfeited' orders:", forfeitedError.message);
        } else {
            console.log(`[Scheduler] Successfully updated ${forfeitedCount || 0} orders to 'Cancelled - Forfeited'.`);
        }

    } catch (err) {
        console.error("[Scheduler] A critical error occurred during the forfeiture check job:", err.message);
    }
};


const initializeScheduler = () => {
    cron.schedule('0 0 * * *', runDailyLifecycleUpdate, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    cron.schedule('05 12 * * *', runForfeitureCheck, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log("✅ Order status schedulers have been initialized.");
    console.log("   - Daily lifecycle job will run at midnight UTC.");
    console.log("   - Forfeiture check job will run at noon UTC.");
};

module.exports = { initializeScheduler };