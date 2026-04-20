module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ status: 'ok', time: new Date().toISOString() });
};
