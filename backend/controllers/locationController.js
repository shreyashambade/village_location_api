const pool = require("../db");
const { getCache, setCache, TTL } = require("../utils/cache");


//helper function 1 : title case 
function toTitleCase(str) {
    return str
        .toLowerCase()
        .replace(/\b\w/g, char => char.toUpperCase());
}


// helper function :clean raw village from DB
function formatVillageName(rawName) {
    return rawName
        .replace(/\(\d+\)/g, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .replace(/\.\s*/g, ". ")
        .trim()
        .replace(/^./, c => c.toUpperCase());
}

// helper function 2 : standard succes response
function sendResponse(
    res, 
    req, 
    data, 
    startTime, 
    cached = false, 
    extraMeta= {}
) {
    const responseTime = Date.now() - startTime;

    res.json({
        success :true,
        count : Array.isArray(data)
            ? data.length
            : data
            ? 1
            : 0,
        data : data,
        meta : {
            requestId : req.requestId || null,
            responseTime,
            cached,
            rateLimit : {
                remaining : req.rateLimit?.remaining ?? 5000,
                limit : req.rateLimit?.limit ?? 5000,
                reset : req.rateLimit?.resetTime ? new Date(
                    req.rateLimit.resetTime
                ).toISOString()
                : null
            },
            ...extraMeta,
        }
    });
}


// helper function : standard error response
function sendError(res, statusCode, errorCode, message) {
    res.status(statusCode).json({
        success : false,
        errorCode : errorCode,
        message : message
    });
}


//helper function : formating village row acc to prd spec shape
function formatVillageRow(row) {
    const name = formatVillageName(row.village_name);
    return {
        value : row.id,
        label : name,
        fullAddress : `${name}, ${toTitleCase(row.subdistrict_name)}, ${toTitleCase(row.district_name)}, ${toTitleCase(row.state_name)}, India`,
        hierarchy : {
            village : name,
            subDistrict : toTitleCase(row.subdistrict_name),
            district : toTitleCase(row.district_name),
            state : toTitleCase(row.state_name),
            country : "India"
        }
    };
}


//1. get all states
exports.getStates = async (req, res) => {
    const startTime = Date.now();
    const cacheKey = "states:all";

    try{
        //check cache first
        const cached = await getCache(cacheKey);
        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse(res,req, data, startTime, true);
        }

        const result = await pool.query("SELECT * FROM states ORDER BY state_name");

        // Save to cache
        await setCache(cacheKey, result.rows, TTL.states);
        sendResponse(res,req, result.rows, startTime, false);

    } catch (err) {
        console.error("getSates Error:",err.message);
        sendError(res,500,"INTERNAL_ERROR","Failed to fetch states");
    }
};




//2.get all districts
exports.getDistricts = async (req, res) => {
    const startTime = Date.now();
    const { state_code } = req.params;
    const cacheKey = `districts:${state_code}`;

    try{
        if(!state_code || isNaN(Number(state_code))) {
            return sendError(res,400,"INVALID_QUERY", "state_code must be valid number");
        }

        // Check cache first
        const cached = await getCache(cacheKey);

        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse(res,req, data, startTime, true);
        }

        const result = await pool.query(
            "SELECT d.* FROM districts d JOIN states s ON d.state_id = s.id WHERE s.state_code = $1 ORDER BY d.district_name",
            [Number(state_code)]
        );

        if(result.rows.length === 0) {
            return sendError(res,404, "NOT_FOUND", "No districts found for this state_code");
        }
        await setCache(cacheKey, result.rows, TTL.districts);
        sendResponse(res,req, result.rows,startTime, false);
    } catch (err) {
        console.error("getDistricts Error:",err.message);
        sendError(res,500, "INTERNAL_ERROR", "Failed to fetch districts");
    }
};


//3.get all subdistricts
exports.getSubdistricts = async (req, res) => {
    const startTime = Date.now();
    const {district_code} = req.params;

    try{
        if (!district_code || isNaN(Number(district_code))) {
            return sendError(res, 400, "INVALID_QUERY", "district_code must be a valid number");
        }

        const cacheKey = `subdistricts:${district_code}`;
        // Check cache first
        const cached = await getCache(cacheKey);
        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse(res,req, data, startTime, true);
        }

        const result = await pool.query("SELECT sd.* FROM subdistricts sd JOIN districts d ON sd.district_id = d.id WHERE d.district_code = $1 ORDER BY sd.subdistrict_name",
            [Number(district_code)]
        );

        if(result.rows.length === 0) {
            return sendError(res,404, "NOT_FOUND", "No subdistricts found for this district_code");
        }

        await setCache(cacheKey, result.rows, TTL.subdistricts);
        sendResponse(res,req, result.rows,startTime, false);
    } catch (err) {
        console.error("getSubdistricts Error:",err.message);
        sendError(res,500, "INTERNAL_ERROR", "Failed to fetch subdistricts");
    }
}


//4.get all villages
exports.getVillages = async (req, res) => {
    const startTime = Date.now();
    const {subdistrict_code} = req.params;

    try{
        if (!subdistrict_code || isNaN(Number(subdistrict_code))) {
            return sendError(res, 400, "INVALID_QUERY", "subdistrict_code must be a valid number");
        }


        //pagiantion 
        const page = Math.max(1,parseInt(req.query.page) || 1);
        const limit = Math.min(500,Math.max(1,parseInt(req.query.limit) || 100));
        const offset = (page - 1) * limit;

        const cacheKey = `villages:${subdistrict_code}:p${page}:l${limit}`;

        // Check cache first
        const cached = await getCache(cacheKey);
        
        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse(
                res, 
                req, 
                data, 
                startTime, 
                true,
                {
                    page,
                    limit,
                }
            );
        }


        const result = await pool.query(
            "SELECT v.id, v.village_code, village_name, sd.subdistrict_name, d.district_name, s.state_name FROM villages v JOIN subdistricts sd ON v.subdistrict_id = sd.id JOIN districts d ON sd.district_id = d.id JOIN states s ON d.state_id = s.id  WHERE sd.subdistrict_code = $1 ORDER BY v.village_name LIMIT $2 OFFSET $3",
            [Number(subdistrict_code),limit,offset]
        );

        if (result.rows.length === 0 && page === 1) {
            return sendError(res, 404, "NOT_FOUND", "No villages found for this subdistrict code");
        }

        const formatted = result.rows.map(formatVillageRow);

        await setCache(cacheKey, formatted, TTL.villages);

        sendResponse(res, req, formatted, startTime, false, {
            page,
            limit,
        });

    } catch (err) {
        console.error("getVillages error:",err.message);
        sendError(res,500,"INTERNAL_ERROR", "Failed to fetch villages");
    }
};



//search  api
exports.searchVillages = async (req,res) => {
    const startTime = Date.now();
    try {
        const { q, state, district, subDistrict } = req.query;

        if (!q || q.trim().length < 2) {
            return sendError(res, 400, "INVALID_QUERY", "Search query must be at least 2 characters");
        }

        const search = q.trim().toLowerCase();
        const cacheKey = `search:${search}:state=${state || "all"}:district=${district || "all"}:subDistrict=${subDistrict || "all"}`;

        // Check cache first
        const cached = await getCache(cacheKey);
        
        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse(res,req, data, startTime, true);
        }

        const result = await pool.query(
            `SELECT  v.id,v.village_name,sd.subdistrict_name,d.district_name,s.state_name
            FROM villages v
            JOIN subdistricts sd 
            ON v.subdistrict_id = sd.id
            JOIN districts d 
            ON sd.district_id = d.id
            JOIN states s 
            ON d.state_id = s.id
            WHERE v.village_name ILIKE $1
            AND ($2::text IS NULL OR s.state_name ILIKE $2)
            AND ($3::text IS NULL OR d.district_name ILIKE $3)
            AND ($4::text IS NULL OR sd.subdistrict_name ILIKE $4)
            ORDER BY 
            LENGTH(v.village_name),
            v.village_name ASC
            LIMIT 20`,
            [`%${search}%`,state ? state : null,district ? district : null,subDistrict ? subDistrict : null]
        );

        const formatted = result.rows.map(formatVillageRow);
        await setCache(cacheKey, formatted, TTL.search);

        sendResponse(res,req, formatted, startTime, false);
    } catch (err) {
        console.error("searchVillages error",err.message);
        sendError(res,500,"INTERNAL_ERROR", "Search failed");
    }
}


// Autocomplete villages api
exports.autocompleteVillages = async (req,res) => {
    const startTime = Date.now();
    try {
        const { q, hierarchyLevel = "village" } = req.query;

        if(!q || q.trim().length < 2){
            return sendResponse(res,req,[],startTime, false);
        }

        const search = q.trim().toLowerCase();
        const cacheKey = `autocomplete:${hierarchyLevel}:${search}`;

        // Check cache first
        const cached = await getCache(cacheKey);

        if (cached) {
            const data = typeof cached === "string" ? JSON.parse(cached) : cached;
            return sendResponse(res,req, data, startTime, true);
        }


        let query = "";
        let values = [];


        if (hierarchyLevel === "state") {
            query = 
            `SELECT id, state_name AS label
            FROM states
            WHERE state_name ILIKE $1
            ORDER BY state_name ASC
            LIMIT 10`;
            values = [`${search}%`];
            
        } else if (hierarchyLevel === "district") {
            query =
            `SELECT d.id, d.district_name AS label, s.state_name
            FROM districts d
            JOIN states s
            ON d.state_id = s.id
            WHERE d.district_name ILIKE $1
            ORDER BY d.district_name ASC
            LIMIT 10`;
            values = [`${search}%`];
        } else if (hierarchyLevel === "subdistrict") {
            query = 
            `SELECT sd.id, sd.subdistrict_name AS label, d.district_name, s.state_name
            FROM subdistricts sd
            JOIN districts d ON sd.district_id = d.id
            JOIN states s ON d.state_id = s.id
            WHERE sd.subdistrict_name ILIKE $1
            ORDER BY sd.subdistrict_name ASC
            LIMIT 10`;
            values = [`${search}%`];
        } else if (hierarchyLevel === "village") {
             // default village autocomplete
            query = 
            `SELECT v.id, v.village_name, sd.subdistrict_name, d.district_name, s.state_name
            FROM villages v
            JOIN subdistricts sd ON v.subdistrict_id = sd.id
            JOIN districts d ON sd.district_id = d.id
            JOIN states s ON d.state_id = s.id
            WHERE v.village_name ILIKE $1
            ORDER BY
            LENGTH(v.village_name),
            v.village_name ASC
            LIMIT 10`;
            values = [`${search}%`];
        } else {
            return sendError(res, 400, "INVALID_QUERY", "Invalid hierarchyLevel. Use village, subdistrict, district, or state");
        }

        const result = await pool.query(query, values);

        let formatted = [];

        if (hierarchyLevel === "village") {
            formatted = result.rows.map(formatVillageRow);
        } else {
            formatted = result.rows.map(row => ({
                value : row.id,
                label : row.label,
                hierarchyLevel
            }));
        }
        await setCache(cacheKey, formatted, TTL.autocomplete);

        
        sendResponse(res,req, formatted,startTime, false);
    } catch (err) {
        console.error("AutocompleteVillages ERROR:",err.message);
        sendError(res,500, "INTERNAL_ERROR", "Autocomplete failed");
    }
};