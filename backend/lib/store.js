// Drivers: one entity per registered driver (starts offline at their home area).
const drivers = [];
const initials = n => n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
function addDriver(u) {
  if (drivers.some(d => d.userId === u.id)) return;
  drivers.push({ id: 'U' + u.id, userId: u.id, name: u.name, label: initials(u.name), vehicleType: u.driver.vehicleType, plate: u.driver.plate,
    at: u.driver.homeArea, online: false, busy: false, tripId: null });
}
module.exports = { drivers, addDriver };
