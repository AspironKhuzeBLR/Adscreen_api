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
            .lt("end_date", now);

        if (completedError) console.error("[Scheduler - Midnight] Error updating 'Completed' orders:", completedError.message);
        else console.log(`[Scheduler - Midnight] Successfully updated ${completedCount || 0} orders to 'Completed'.`);

    } catch (err) {
        console.error("[Scheduler - Midnight] A critical error occurred during the lifecycle job:", err.message);
    }
};


const runForfeitureCheck = async () => {
    console.log(`[Scheduler - Noon] Running forfeiture check job at ${new Date().toISOString()}`);
    try {
        const forfeitCutoff = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

        const { count: forfeitedCount, error: forfeitedError } = await supabase
            .from("orders")
            .update({ status: "Cancelled - Forfeited" })
            .eq("status", "Design Revise")
            .lt("start_date", forfeitCutoff);

        if (forfeitedError) console.error("[Scheduler - Noon] Error updating 'Forfeited' orders:", forfeitedError.message);
        else console.log(`[Scheduler - Noon] Successfully updated ${forfeitedCount || 0} orders to 'Cancelled - Forfeited'.`);

    } catch (err) {
        console.error("[Scheduler - Noon] A critical error occurred during the forfeiture check job:", err.message);
    }
};


const initializeScheduler = () => {
    cron.schedule('30 15 * * *', runDailyLifecycleUpdate, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    cron.schedule('0 12 * * *', runForfeitureCheck, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log("✅ Order status schedulers have been initialized.");
    console.log("   - Daily lifecycle job will run at midnight UTC.");
    console.log("   - Forfeiture check job will run at noon UTC.");
};

module.exports = { initializeScheduler };