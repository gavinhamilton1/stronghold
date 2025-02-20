const transactionData = [
    {
        date: "Mar 15, 2024",
        description: "Transfer to Savings",
        account: "Checking ****4523",
        type: "Transfer",
        amount: -5000.00,
        balance: 42382.43
    },
    {
        date: "Mar 14, 2024",
        description: "Payroll Deposit",
        account: "Checking ****4523",
        type: "Deposit",
        amount: 12435.82,
        balance: 47382.43
    },
    {
        date: "Mar 13, 2024",
        description: "Interest Payment",
        account: "Savings ****7890",
        type: "Interest",
        amount: 234.51,
        balance: 155234.51
    },
    // Add more transactions...
];

function populateTransactions() {
    const tbody = document.querySelector('.transactions-table tbody');
    tbody.innerHTML = transactionData.map(t => `
        <tr>
            <td>${t.date}</td>
            <td>${t.description}</td>
            <td>${t.account}</td>
            <td>${t.type}</td>
            <td class="${t.amount > 0 ? 'positive' : 'negative'}">
                ${t.amount > 0 ? '+' : ''}$${Math.abs(t.amount).toFixed(2)}
            </td>
            <td>$${t.balance.toFixed(2)}</td>
        </tr>
    `).join('');
}

document.addEventListener('DOMContentLoaded', populateTransactions); 