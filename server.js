const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = 3000;

// Enable CORS
app.use(cors());
app.use(express.json()); // Enable parsing of JSON bodies


// PostgreSQL connection setup
const pool = new Pool({
    user: "postgres",
    host: 'localhost',
    database: 'LegphelDb',
    password: "Jurmey",
    port: 5432,
});

// API endpoint to get menu items
app.get('/api/menu', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Menu');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// API endpoint to add a new menu item
app.post('/api/menu', async (req, res) => {
    const { menu_name, menu_type, menu_price } = req.body;

    // Validate input data
    if (!menu_name || !menu_type || typeof menu_price !== 'number') {
        return res.status(400).send('Invalid input');
    }

    try {
        const result = await pool.query(
            'INSERT INTO Menu (menu_name, menu_type, menu_price) VALUES ($1, $2, $3) RETURNING *',
            [menu_name, menu_type, menu_price]
        );
        res.status(201).json(result.rows[0]); // Respond with the newly created menu item
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// API endpoint to edit a menu item by menu_name
app.put('/api/menu/:menu_name', async (req, res) => {
    const { menu_name } = req.params; // Get the menu_name from the URL
    const { menu_type, menu_price } = req.body; // Get data from request body

    // Validate input data
    if (!menu_name || !menu_type || typeof menu_price !== 'number') {
        return res.status(400).send('Invalid input');
    }

    try {
        const result = await pool.query(
            'UPDATE Menu SET menu_type = $1, menu_price = $2 WHERE menu_name = $3 RETURNING *',
            [menu_type, menu_price, menu_name]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Menu item not found');
        }

        res.status(200).json(result.rows[0]); // Respond with the updated menu item
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// API endpoint to delete a menu item by menu_name
app.delete('/api/menu/:menu_name', async (req, res) => {
    const { menu_name } = req.params; // Get menu_name from the URL

    try {
        const result = await pool.query(
            'DELETE FROM Menu WHERE menu_name = $1 RETURNING *',
            [menu_name]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Menu item not found');
        }

        res.status(204).send(); // Respond with no content
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// API endpoint to get TableStat data
app.get('/api/tablestat', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM TableStat');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


app.post('/api/bill', async (req, res) => {
    try {
        const { table_name, order_number, bill_time, bill_date, total_amount, items } = req.body;

        // Validate input data
        if (!table_name || !order_number || !bill_time || !bill_date || typeof total_amount !== 'number' || !Array.isArray(items)) {
            console.error("Invalid input data:", req.body);
            return res.status(400).send('Invalid input');
        }

        // Insert into the Bill table
        const billResult = await pool.query(
            'INSERT INTO Bill (table_name, order_number, bill_time, bill_date, total_amount) VALUES ($1, $2, $3, $4, $5) RETURNING bill_id',
            [table_name, order_number, bill_time, bill_date, total_amount]
        );

        const billId = billResult.rows[0].bill_id;

        // Check if items are not null
        if (items && items.length > 0) {
            // Insert each item into the Bill_Items table
            for (const item of items) {
                await pool.query(
                    'INSERT INTO Bill_Items (bill_id, menu_name, price, quantity, amount) VALUES ($1, $2, $3, $4, $5)',
                    [billId, item.MenuName, item.Price, item.Quantity, item.Amount] // Ensure 'amount' is being used
                );
            }
        } else {
            console.warn("No items to insert for bill ID:", billId);
        }

        res.status(201).json({ billId });
    } catch (err) {
        console.error("Error inserting bill:", err);
        res.status(500).send('Server error');
    }
});


// API endpoint to get all billing information
app.get('/api/bill', async (req, res) => {
    try {
        // Query to get the bill information with associated items
        const result = await pool.query(`
            SELECT 
                b.bill_id, 
                b.table_name, 
                b.order_number, 
                b.bill_time, 
                b.bill_date, 
                b.total_amount,
                bi.menu_name, 
                bi.price, 
                bi.quantity, 
                bi.amount 
            FROM Bill b
            LEFT JOIN Bill_Items bi ON b.bill_id = bi.bill_id
            ORDER BY b.bill_id
        `);

        // Group the result by bill_id to structure the data
        const bills = result.rows.reduce((acc, row) => {
            const billId = row.bill_id;

            // If this bill isn't already added to the accumulator, add it
            if (!acc[billId]) {
                acc[billId] = {
                    bill_id: billId,
                    table_name: row.table_name,
                    order_number: row.order_number,
                    bill_time: row.bill_time,
                    bill_date: row.bill_date,
                    total_amount: row.total_amount,
                    items: [] // Initialize an empty items array
                };
            }

            // Add the associated item to the items array for this bill
            if (row.menu_name) {
                acc[billId].items.push({
                    menu_name: row.menu_name,
                    price: row.price,
                    quantity: row.quantity,
                    amount: row.amount
                });
            }

            return acc;
        }, {});

        // Send the grouped result as an array
        res.json(Object.values(bills));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// API endpoint to get billing information by order_number
app.get('/api/bill/order_number/:order_number', async (req, res) => {
    const { order_number } = req.params; // Extract order_number from the request parameters

    try {
        const result = await pool.query(`
            SELECT 
                b.bill_id, 
                b.table_name, 
                b.order_number, 
                b.bill_time, 
                b.bill_date, 
                b.total_amount,
                bi.menu_name, 
                bi.price, 
                bi.quantity, 
                bi.amount 
            FROM Bill b
            LEFT JOIN Bill_Items bi ON b.bill_id = bi.bill_id
            WHERE b.order_number = $1
            ORDER BY b.bill_id
        `, [order_number]); // Use parameterized query for safety

        // Check if any bill was found
        if (result.rows.length === 0) {
            return res.status(404).send('No bill found with the specified order number.');
        }

        // Group the result by bill_id to structure the data
        const bills = result.rows.reduce((acc, row) => {
            const billId = row.bill_id;

            // If this bill isn't already added to the accumulator, add it
            if (!acc[billId]) {
                acc[billId] = {
                    bill_id: billId,
                    table_name: row.table_name,
                    order_number: row.order_number,
                    bill_time: row.bill_time,
                    bill_date: row.bill_date,
                    total_amount: row.total_amount,
                    items: [] // Initialize an empty items array
                };
            }

            // Add the associated item to the items array for this bill
            if (row.menu_name) {
                acc[billId].items.push({
                    menu_name: row.menu_name,
                    price: row.price,
                    quantity: row.quantity,
                    amount: row.amount
                });
            }

            return acc;
        }, {});

        // Send the grouped result as an array
        res.json(Object.values(bills));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// API endpoint to get billing information by bill_id
app.get('/api/bill/bill_id/:bill_id', async (req, res) => {
    const { bill_id } = req.params; // Extract bill_id from the request parameters

    try {
        const result = await pool.query(`
            SELECT 
                b.bill_id, 
                b.table_name, 
                b.order_number, 
                b.bill_time, 
                b.bill_date, 
                b.total_amount,
                bi.menu_name, 
                bi.price, 
                bi.quantity, 
                bi.amount 
            FROM Bill b
            LEFT JOIN Bill_Items bi ON b.bill_id = bi.bill_id
            WHERE b.bill_id = $1
            ORDER BY b.bill_id
        `, [bill_id]); // Use parameterized query for safety

        // Check if any bill was found
        if (result.rows.length === 0) {
            return res.status(404).send('No bill found with the specified bill ID.');
        }

        // Group the result by bill_id to structure the data
        const bills = result.rows.reduce((acc, row) => {
            const billId = row.bill_id;

            // If this bill isn't already added to the accumulator, add it
            if (!acc[billId]) {
                acc[billId] = {
                    bill_id: billId,
                    table_name: row.table_name,
                    order_number: row.order_number,
                    bill_time: row.bill_time,
                    bill_date: row.bill_date,
                    total_amount: row.total_amount,
                    items: [] // Initialize an empty items array
                };
            }

            // Add the associated item to the items array for this bill
            if (row.menu_name) {
                acc[billId].items.push({
                    menu_name: row.menu_name,
                    price: row.price,
                    quantity: row.quantity,
                    amount: row.amount
                });
            }

            return acc;
        }, {});

        // Send the grouped result as an array
        res.json(Object.values(bills));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});



// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


